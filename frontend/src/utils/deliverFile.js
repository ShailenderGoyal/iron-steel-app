import toast from 'react-hot-toast';

// Chrome on Android — and so the installed Android app, which runs on Chrome — has no inline
// PDF viewer and saves blob downloads silently, with nothing on screen to say it happened.
// So on Android, exported files go to the share sheet instead (WhatsApp, Gmail, Drive,
// Print…). If sharing isn't possible — e.g. building the file took long enough that the tap
// no longer counts as a user action — the file is saved to Downloads and a toast says so.
export const isAndroid = /Android/i.test(navigator.userAgent);

export async function shareOrDownload(blob, fileName, title) {
  const file = new File([blob], fileName, { type: blob.type.split(';')[0] });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user closed the share sheet
    }
  }
  downloadBlob(blob, fileName);
  toast.success(`Saved to Downloads: ${fileName}`, { duration: 6000 });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
