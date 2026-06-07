import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '@/auth/useMe';
import { useCreate } from '@/api/hooks';
import { ApiError, newId } from '@/api/client';
import { PARTNER_CATALOGUE, PARTNER_ROLES } from '@/lib/fieldCatalogue';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { FieldCatalogueAside } from '@/ui/FieldCatalogueAside';
import { FormSection, FieldRow, Input, Textarea, RadioCards, CheckboxCard } from '@/ui/Form';

const EMPTY = {
  name: '',
  country_iso2: '',
  city: '',
  address: '',
  identifier: '',
  contact_person: '',
  contact_email: '',
  archived: false
};

export function CreatePartner() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [form, setForm] = useState(EMPTY);
  const [roles, setRoles] = useState(/** @type {string[]} */ ([]));
  const [error, setError] = useState('');

  const create = useCreate('BusinessPartners', {
    invalidate: [['BusinessPartners'], ['count', 'BusinessPartners']],
    onSuccess: (row) => navigate(`/partners/${row.ID}`)
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleRole = (value) => (on) =>
    setRoles((r) => (on ? [...r, value] : r.filter((x) => x !== value)));

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.country_iso2.trim()) {
      setError('Name and Country are mandatory.');
      return;
    }

    if (form.name.trim().length > 70) {
      setError('Partner name must not exceed 70 characters.');
      return;
    }

    if (form.country_iso2.trim().length !== 2) {
      setError('Country must contain exactly 2 characters (ISO-2 code, e.g. DE, IN, IT).');
      return;
    }
    if (roles.length === 0) {
      setError('Select at least one supply chain role.');
      return;
    }
    // owning_organization is the caller's own tenant (assigning to another org is rejected).
    create.mutate(
      {
        name: form.name.trim(),
        country_iso2: form.country_iso2.trim().toUpperCase(),
        city: form.city || null,
        address: form.address || null,
        identifier: form.identifier || null,
        contact_person: form.contact_person || null,
        contact_email: form.contact_email || null,
        archived: form.archived,
        owning_organization_ID: me?.organizationId,
        // deep insert into BusinessPartnerRoles — each row needs its own client-side key
        roles: roles.map((role) => ({ ID: newId(), role }))
      },
      {
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : 'Could not save the partner.')
      }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Business partners', to: '/partners' },
          { label: 'Create business partner' }
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-ink">Create business partner</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Add a new supply chain partner. Fields marked <span className="text-red-600">*</span> are
          mandatory. Public fields appear on the consumer DPP.
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-6">
          <FormSection
            title="Partner identity"
            description="Name and Country are mandatory and the only fields visible on the public consumer DPP."
          >
            <FieldRow label="Name" required visibility="public" htmlFor="name" hint={`Maximum 70 characters (${form.name.length}/70)`}>
              <Input id="name" value={form.name} onChange={set('name')} placeholder="TextileCo India" maxLength={70} />
            </FieldRow>
            <FieldRow label="Country" required visibility="public" htmlFor="country" hint={`Exactly 2 characters (ISO-2 code, e.g. DE, IN, IT) (${form.country_iso2.length}/2)`}>
              <Input
                id="country"
                value={form.country_iso2}
                onChange={set('country_iso2')}
                placeholder="IN"
                maxLength={2}
              />
            </FieldRow>
            <FieldRow label="City" visibility="internal" htmlFor="city">
              <Input id="city" value={form.city} onChange={set('city')} placeholder="Mumbai" />
            </FieldRow>
            <FieldRow
              label="External identifier"
              visibility="internal"
              htmlFor="identifier"
              hint="VAT number, GLN, DUNS or any standard external ID."
            >
              <Input
                id="identifier"
                value={form.identifier}
                onChange={set('identifier')}
                placeholder="VAT-IN-0012345"
              />
            </FieldRow>
            <FieldRow label="Address" visibility="internal" htmlFor="address" className="md:col-span-2">
              <Textarea id="address" value={form.address} onChange={set('address')} />
            </FieldRow>
          </FormSection>

          <FormSection
            title="Contact information"
            description="Both fields are optional and internal only — never shown on the public consumer DPP."
          >
            <FieldRow label="Contact person" visibility="internal" htmlFor="cp">
              <Input id="cp" value={form.contact_person} onChange={set('contact_person')} />
            </FieldRow>
            <FieldRow label="Contact email" visibility="internal" htmlFor="ce">
              <Input id="ce" type="email" value={form.contact_email} onChange={set('contact_email')} />
            </FieldRow>
          </FormSection>

          <FormSection title="Partner status" description="Defaults to Active on creation. Internal only.">
            <div className="md:col-span-2">
              <RadioCards
                value={form.archived ? 'archived' : 'active'}
                onChange={(v) => setForm((f) => ({ ...f, archived: v === 'archived' }))}
                options={[
                  { value: 'active', label: 'Active', hint: 'Can be linked to production batches' },
                  { value: 'archived', label: 'Archived', hint: 'Hidden from selection; links preserved' }
                ]}
              />
            </div>
          </FormSection>

          <FormSection
            title="Supply chain roles"
            description="At least one required. A partner can hold multiple roles. Roles are internal only."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-2">
              {PARTNER_ROLES.map((r) => (
                <CheckboxCard
                  key={r.value}
                  title={r.label}
                  hint={r.hint}
                  checked={roles.includes(r.value)}
                  onChange={toggleRole(r.value)}
                />
              ))}
            </div>
          </FormSection>

          <div className="flex items-center justify-end gap-3 border-t border-black/5 pt-5">
            <Button type="button" variant="outline" onClick={() => navigate('/partners')}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Save business partner'}
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <FieldCatalogueAside fields={PARTNER_CATALOGUE} />
          <Card>
            <CardTitle>Next steps after saving</CardTitle>
            <ol className="mt-3 space-y-2 text-sm text-ink-muted">
              <li>1. Create a product</li>
              <li>2. Add variants and a bill of materials</li>
              <li>3. Link this partner as factory or supplier on a batch</li>
            </ol>
          </Card>
        </div>
      </div>
    </form>
  );
}
