'use strict';

/**
 * AI assistant integration tests. Gemini is mocked (NODE_ENV=test never calls the
 * real API) so we exercise the orchestration loop, tool execution, dryRun
 * validation, tenant isolation and the /ai/extract route deterministically.
 */

// Mock the Gemini client BEFORE the server boots (jest.mock is hoisted).
jest.mock('../../srv/lib/gemini', () => ({
  isConfigured: jest.fn(() => true),
  generate: jest.fn(),
  extractFromFile: jest.fn(),
  chatModel: () => 'gemini-test',
  extractModel: () => 'gemini-test',
}));

const cds = require('@sap/cds');
const gemini = require('../../srv/lib/gemini');
const session = require('../../srv/lib/session');

const { GET, POST, axios } = cds.test().in(__dirname + '/../..');
const loadDemoFixtures = require('../helpers/loadDemoFixtures');

// Restore the demo rows removed from the shipped seed (second tenant + jacket/hoodie chains).
beforeAll(loadDemoFixtures);

const ALICE = { username: 'alice.advanced', password: 'x' }; // company_advanced, ORG-A
const CAROL = { username: 'carol.user', password: 'x' };      // company_user,     ORG-A
const DAN = { username: 'dan.advanced.b', password: 'x' };    // company_advanced, ORG-B

/** Parse the LargeString result of aiChat (OData wraps it as { value: "<json>" }). */
function parseChat(res) {
  return JSON.parse(res.data.value);
}

beforeEach(() => {
  gemini.generate.mockReset();
  gemini.extractFromFile.mockReset();
  gemini.isConfigured.mockReturnValue(true);
});

describe('aiChat orchestration', () => {
  test('returns a plain text reply when the model calls no tools', async () => {
    gemini.generate.mockResolvedValueOnce({ text: 'Hello, how can I help?', functionCalls: [], usage: {} });
    axios.defaults.auth = ALICE;
    const res = await POST('/odata/v4/dpp/aiChat', {
      messages: JSON.stringify([{ role: 'user', content: 'hi' }]),
    });
    const payload = parseChat(res);
    expect(payload.reply).toBe('Hello, how can I help?');
    expect(payload.proposals).toEqual([]);
    expect(gemini.generate).toHaveBeenCalledTimes(1);
  });

  test('executes a read tool and feeds the result back to the model', async () => {
    gemini.generate
      .mockResolvedValueOnce({ text: '', functionCalls: [{ name: 'listProducts', args: {} }], usage: {} })
      .mockResolvedValueOnce({ text: 'Here are your products.', functionCalls: [], usage: {} });
    axios.defaults.auth = ALICE;
    const res = await POST('/odata/v4/dpp/aiChat', {
      messages: JSON.stringify([{ role: 'user', content: 'list my products' }]),
    });
    const payload = parseChat(res);
    expect(payload.reply).toBe('Here are your products.');
    expect(gemini.generate).toHaveBeenCalledTimes(2);
    // The second call must include the function response with the tool output.
    const secondCallContents = gemini.generate.mock.calls[1][0].contents;
    const fnResponse = JSON.stringify(secondCallContents).includes('listProducts');
    expect(fnResponse).toBe(true);
  });

  test('proposeProduct with missing mandatory fields reports validation errors (no write)', async () => {
    gemini.generate
      .mockResolvedValueOnce({
        text: '',
        functionCalls: [{ name: 'proposeProduct', args: { name: `AI Draft ${Date.now()}`, brand: 'Acme', product_type: 'finished' } }],
        usage: {},
      })
      .mockResolvedValueOnce({ text: 'A few fields are still missing.', functionCalls: [], usage: {} });
    axios.defaults.auth = ALICE;
    const res = await POST('/odata/v4/dpp/aiChat', {
      messages: JSON.stringify([{ role: 'user', content: 'create a product' }]),
    });
    const payload = parseChat(res);
    expect(payload.proposals).toHaveLength(1);
    expect(payload.proposals[0].entity).toBe('product');
    expect(payload.proposals[0].validation.valid).toBe(false);
    expect(payload.proposals[0].validation.errors.length).toBeGreaterThan(0);
  });

  test('read-only company_user may chat', async () => {
    gemini.generate.mockResolvedValueOnce({ text: 'Sure.', functionCalls: [], usage: {} });
    axios.defaults.auth = CAROL;
    const res = await POST('/odata/v4/dpp/aiChat', {
      messages: JSON.stringify([{ role: 'user', content: 'hi' }]),
    });
    expect(parseChat(res).reply).toBe('Sure.');
  });

  test('503 when the assistant is not configured', async () => {
    gemini.isConfigured.mockReturnValue(false);
    axios.defaults.auth = ALICE;
    await expect(
      POST('/odata/v4/dpp/aiChat', { messages: JSON.stringify([{ role: 'user', content: 'hi' }]) })
    ).rejects.toMatchObject({ response: { status: 503 } });
  });
});

describe('tenant isolation', () => {
  test("org B cannot propose a variant against org A's product", async () => {
    // Discover an ORG-A product name as alice.
    axios.defaults.auth = ALICE;
    const list = await GET('/odata/v4/dpp/Products?$top=1');
    const orgAName = list.data.value[0]?.name;
    expect(orgAName).toBeTruthy();

    // As ORG-B, the importVariants dryRun must not resolve that product.
    gemini.generate
      .mockResolvedValueOnce({
        text: '',
        functionCalls: [{ name: 'proposeVariant', args: { product_name: orgAName, sku: 'X-1' } }],
        usage: {},
      })
      .mockResolvedValueOnce({ text: 'That product was not found.', functionCalls: [], usage: {} });
    axios.defaults.auth = DAN;
    const res = await POST('/odata/v4/dpp/aiChat', {
      messages: JSON.stringify([{ role: 'user', content: 'add a variant' }]),
    });
    const payload = parseChat(res);
    expect(payload.proposals[0].validation.valid).toBe(false);
    expect(payload.proposals[0].validation.errors.some((e) => e.field === 'product_name')).toBe(true);
  });
});

describe('/ai/extract', () => {
  test('401 without a session cookie', async () => {
    await expect(
      axios.post('/ai/extract?entity=product', Buffer.from('%PDF-1.4 x'), {
        headers: { 'Content-Type': 'application/pdf' },
        auth: false,
      })
    ).rejects.toMatchObject({ response: { status: 401 } });
  });

  test('415 for an unsupported file type (authenticated)', async () => {
    axios.defaults.auth = ALICE;
    const users = await GET('/odata/v4/dpp/Users?$filter=username eq \'alice.advanced\'');
    const uid = users.data.value[0].ID;
    const cookie = 'dpp_session=' + session.sign({ uid, sub: 'alice.advanced' }, { scope: 'full' });
    await expect(
      axios.post('/ai/extract?entity=product', Buffer.from('hello'), {
        headers: { 'Content-Type': 'text/plain', Cookie: cookie },
        auth: false,
      })
    ).rejects.toMatchObject({ response: { status: 415 } });
  });

  test('extracts fields from an authenticated upload (mocked model)', async () => {
    gemini.extractFromFile.mockResolvedValueOnce({ name: 'Extracted Tee', brand: 'Acme' });
    axios.defaults.auth = ALICE;
    const users = await GET('/odata/v4/dpp/Users?$filter=username eq \'alice.advanced\'');
    const uid = users.data.value[0].ID;
    const cookie = 'dpp_session=' + session.sign({ uid, sub: 'alice.advanced' }, { scope: 'full' });
    const res = await axios.post('/ai/extract?entity=product', Buffer.from('%PDF-1.4 fake'), {
      headers: { 'Content-Type': 'application/pdf', Cookie: cookie },
      auth: false,
    });
    expect(res.data.entity).toBe('product');
    expect(res.data.fields.name).toBe('Extracted Tee');
  });
});
