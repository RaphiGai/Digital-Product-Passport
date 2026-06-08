import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { odataGet, ApiError, newId } from '@/api/client';
import { useUpdate } from '@/api/hooks';
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

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function PartnerEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');

  const { data: bp, isLoading } = useQuery({
    queryKey: ['BusinessPartners', id],
    queryFn: () => odataGet('BusinessPartners', id, { expand: ['roles'] })
  });

  /*const update = useUpdate('BusinessPartners', {
    invalidate: [['BusinessPartners'], ['BusinessPartners', id]],
    onSuccess: () => navigate(`/partners/${id}`)
  });*/

  const update = useUpdate('BusinessPartners', {
  invalidate: [['BusinessPartners'], ['BusinessPartners', id]]
  });

  useEffect(() => {
    if (!bp) return;

    setForm({
      name: bp.name ?? '',
      country_iso2: bp.country_iso2 ?? '',
      city: bp.city ?? '',
      address: bp.address ?? '',
      identifier: bp.identifier ?? '',
      contact_person: bp.contact_person ?? '',
      contact_email: bp.contact_email ?? '',
      archived: !!bp.archived
    });

    setRoles((bp.roles ?? []).map((r) => r.role));
  }, [bp]);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

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

    if (form.contact_email.trim() && !isValidEmail(form.contact_email.trim())) {
      setError('Please enter a valid contact email address, e.g. name@company.com.');
      return;
    }

    if (roles.length === 0) {
      setError('Select at least one supply chain role.');
      return;
    }

    update.mutate(
      {
        key: id,
        payload: {
          name: form.name.trim(),
          country_iso2: form.country_iso2.trim().toUpperCase(),
          city: form.city.trim() || null,
          address: form.address.trim() || null,
          identifier: form.identifier.trim() || null,
          contact_person: form.contact_person.trim() || null,
          contact_email: form.contact_email.trim() || null,
          archived: form.archived,
          roles: roles.map((role) => ({ ID: newId(), role }))
        }
      },
      {
        onSuccess: () => navigate(`/partners/${id}`),
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : 'Could not update the partner.')
      }
    );
  };

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!bp) return <p className="text-ink-muted">Partner not found.</p>;

  return (
    <form onSubmit={submit} className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Business partners', to: '/partners' },
          { label: bp.name, to: `/partners/${id}` },
          { label: 'Edit partner' }
        ]}
      />

      <div>
        <h1 className="text-2xl font-semibold text-ink">Edit business partner</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Update partner master data. Fields marked <span className="text-red-600">*</span> are mandatory.
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-6">
          <FormSection
            title="Partner identity"
            description="Name and Country are mandatory and visible on the public consumer DPP."
          >
            <FieldRow
              label="Name"
              required
              visibility="public"
              htmlFor="name"
              hint={`Maximum 70 characters (${form.name.length}/70)`}
            >
              <Input
                id="name"
                value={form.name}
                onChange={set('name')}
                placeholder="TextileCo India"
                maxLength={70}
              />
            </FieldRow>

            <FieldRow
              label="Country"
              required
              visibility="public"
              htmlFor="country"
              hint={`Exactly 2 characters (ISO-2 code, e.g. DE, IN, IT) (${form.country_iso2.length}/2)`}
            >
              <Input
                id="country"
                value={form.country_iso2}
                onChange={set('country_iso2')}
                placeholder="IN"
                maxLength={2}
              />
            </FieldRow>

            <FieldRow label="City" visibility="internal" htmlFor="city">
              <Input id="city" value={form.city} onChange={set('city')} placeholder="Mumbai" maxLength={70} />
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
                maxLength={40}
              />
            </FieldRow>

            <FieldRow label="Address" visibility="internal" htmlFor="address" className="md:col-span-2">
              <Textarea id="address" value={form.address} onChange={set('address')} maxLength={150} />
            </FieldRow>
          </FormSection>

          <FormSection
            title="Contact information"
            description="Both fields are optional and internal only — never shown on the public consumer DPP."
          >
            <FieldRow label="Contact person" visibility="internal" htmlFor="cp">
              <Input id="cp" value={form.contact_person} onChange={set('contact_person')} maxLength={70} />
            </FieldRow>

            <FieldRow
              label="Contact email"
              visibility="internal"
              htmlFor="ce"
              hint="Enter a valid email address, e.g. contact@company.com."
            >
              <Input
                id="ce"
                type="email"
                value={form.contact_email}
                onChange={set('contact_email')}
                placeholder="contact@company.com"
                maxLength={70}
              />
            </FieldRow>
          </FormSection>

          <FormSection title="Partner status" description="Internal only. Archived partners are hidden from selection.">
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
            <Button type="button" variant="outline" onClick={() => navigate(`/partners/${id}`)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending} >
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <FieldCatalogueAside fields={PARTNER_CATALOGUE} />
          <Card>
            <CardTitle>Editing note</CardTitle>
            <p className="mt-3 text-sm text-ink-muted">
              Changes affect internal partner master data. Public DPP visibility is limited to selected public fields.
            </p>
          </Card>
        </div>
      </div>
    </form>
  );
}