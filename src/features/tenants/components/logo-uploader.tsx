"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { GraduationCap, Upload } from "lucide-react";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { IDLE, type FormResult } from "@/lib/form-result";

type Action = (prev: FormResult<unknown>, formData: FormData) => Promise<FormResult<unknown>>;

export function LogoUploader({
  logoSrc,
  schoolName,
  uploadAction,
  removeAction,
}: {
  logoSrc: string | null;
  schoolName: string;
  uploadAction: Action;
  removeAction: Action;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: FormResult<unknown>, formData: FormData) => {
      const result = await uploadAction(prev, formData);
      if (result.status === "success") {
        // The saved logo now comes from the server; clear the local choice.
        setPreview(null);
        formRef.current?.reset();
      }
      return result;
    },
    IDLE,
  );

  // Free the temporary preview URL when it changes or the component unmounts.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const shown = preview ?? logoSrc;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview or private logo route
          <img src={shown} alt={`${schoolName} logo`} className="size-full object-contain" />
        ) : (
          <GraduationCap className="size-10 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <form ref={formRef} action={formAction} className="flex flex-1 flex-col gap-3">
        {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
        {state.status === "success" && (
          <FormAlert tone="success">{state.message}</FormAlert>
        )}
        <label htmlFor="school-logo" className="text-sm font-medium">
          School logo
        </label>
        <input
          id="school-logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-describedby="school-logo-help"
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setTooBig(Boolean(file && file.size > 1024 * 1024));
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
        <p id="school-logo-help" className="text-xs text-muted-foreground">
          PNG, JPEG or WebP, up to 1 MB. A square image works best.
        </p>
        {tooBig && <FormAlert>This file is larger than 1 MB. Choose a smaller image.</FormAlert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !preview || tooBig}>
            <Upload aria-hidden="true" />
            {pending ? "Uploading…" : "Upload logo"}
          </Button>
          {logoSrc && !preview && (
            <ConfirmAction
              label="Remove logo"
              title="Remove the school logo?"
              description="Report sheets and letters will show the school name without a logo."
              confirmLabel="Remove logo"
              variant="destructive"
              size="md"
              action={removeAction}
            />
          )}
        </div>
      </form>
    </div>
  );
}
