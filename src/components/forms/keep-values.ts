"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Submit handler that runs a `useActionState` action without React's automatic
 * form reset, so typed values stay in place when the server returns field errors.
 * Use as `<form onSubmit={keepValues(formAction)}>` instead of `action={formAction}`.
 */
export function keepValues(formAction: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };
}
