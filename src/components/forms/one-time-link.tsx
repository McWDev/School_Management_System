"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormAlert } from "./form-alert";

/** Shows a one-time link (account setup / password reset) once, with a copy button. */
export function OneTimeLink({
  url,
  expiresAt,
  intro,
}: {
  url: string;
  expiresAt: string;
  intro: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <FormAlert tone="success">{intro}</FormAlert>
      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          aria-label="One-time link"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Expires {new Date(expiresAt).toLocaleString()}. It works once and is not shown again — share
        it with the person over a trusted channel.
      </p>
    </div>
  );
}
