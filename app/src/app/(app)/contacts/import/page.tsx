import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { ImportWizard } from "./import-wizard";

async function Gate() {
  await requireUser(["admin"]);
  return <ImportWizard />;
}

export default function ImportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <Gate />
    </Suspense>
  );
}
