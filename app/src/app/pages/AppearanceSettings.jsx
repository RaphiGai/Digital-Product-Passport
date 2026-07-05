import { useEffect, useState } from 'react';
import { useMe } from '@/auth/useMe';
import { useUnboundAction } from '@/api/hooks';
import { ApiError } from '@/api/client';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';

const themes = [
  {
    value: 'green',
    label: 'Green',
    description: 'Default DPP Studio theme',
    color: 'bg-brand-600'
  },
  {
    value: 'blue',
    label: 'Blue',
    description: 'Blue interface theme',
    color: 'bg-blue-600'
  },
  {
    value: 'purple',
    label: 'Purple',
    description: 'Purple interface theme',
    color: 'bg-purple-600'
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Dark interface theme',
    color: 'bg-gray-800'
  }
];

export function AppearanceSettings() {
  const { data: me } = useMe();
  // Self-service theme update; invalidating ['me'] re-applies it app-wide (AppShell).
  const updateProfile = useUnboundAction({ invalidate: [['me']] });

  // Instant value from the localStorage cache; the server value (me) is the source
  // of truth and is adopted once it resolves.
  const [selectedTheme, setSelectedTheme] = useState(
    localStorage.getItem('appearanceTheme') || 'green'
  );
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (me?.appearanceTheme) setSelectedTheme(me.appearanceTheme);
  }, [me?.appearanceTheme]);

  // Live preview: apply the current selection app-wide while choosing.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', selectedTheme);
  }, [selectedTheme]);

  const saveAppearance = () => {
    setMsg(null);
    updateProfile.mutate(
      { action: 'updateProfile', payload: { appearanceTheme: selectedTheme } },
      {
        onSuccess: () => {
          try {
            localStorage.setItem('appearanceTheme', selectedTheme);
          } catch {
            /* ignore storage errors */
          }
          setMsg({ kind: 'success', text: 'Appearance settings saved successfully.' });
        },
        onError: (err) =>
          setMsg({
            kind: 'error',
            text: err instanceof ApiError ? err.message : 'Could not save appearance settings.'
          })
      }
    );
  };

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Appearance' }
        ]}
      />

      <div>
        <h1 className="text-2xl font-semibold text-ink">Appearance</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Choose the color theme for your personal workspace.
        </p>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card className="p-6">
        <CardTitle>Color theme</CardTitle>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => (
            <button
              key={theme.value}
              type="button"
              onClick={() => setSelectedTheme(theme.value)}
              className={`rounded-2xl border p-4 text-left transition ${
                selectedTheme === theme.value
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-black/10 bg-card hover:border-brand-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`h-10 w-10 rounded-full ${theme.color}`} />

                <div>
                  <div className="font-medium text-ink">{theme.label}</div>
                  <div className="text-sm text-ink-muted">
                    {theme.description}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-black/10 bg-canvas p-3">
                <div className="mb-2 h-3 w-20 rounded bg-brand-600" />
                <div className="mb-2 h-2 w-full rounded bg-brand-100" />
                <div className="h-2 w-2/3 rounded bg-brand-200" />
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 flex justify-end border-t border-black/5 pt-5">
          <Button type="button" onClick={saveAppearance} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Card>
    </div>
  );
}