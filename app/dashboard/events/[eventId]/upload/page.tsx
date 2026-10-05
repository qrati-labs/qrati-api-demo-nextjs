import { UploadForm } from "@/components/UploadForm";

export default async function UploadPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <UploadForm eventId={eventId} />;
}
