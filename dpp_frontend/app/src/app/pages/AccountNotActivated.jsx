import { Card, CardDescription, CardTitle } from '@/ui/Card';

/** Shown when the caller is authenticated but has no active row in the Users table (403). */
export function AccountNotActivated() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="max-w-md text-center">
        <CardTitle>Account not activated</CardTitle>
        <CardDescription className="mt-2">
          You are signed in, but your account is not yet registered in DPP Studio. Please contact
          your organisation administrator to be added.
        </CardDescription>
      </Card>
    </div>
  );
}
