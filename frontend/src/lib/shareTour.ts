/** Shares a link with the system sheet when the browser has one, and copies it otherwise. Cancelling the sheet is not an error. */
export async function shareTour(data: { title: string; url: string }): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) { await navigator.share({ title: data.title, text: data.title, url: data.url }); return 'shared'; }
    await navigator.clipboard.writeText(data.url);
    return 'copied';
  } catch (error) {
    return (error as { name?: string })?.name === 'AbortError' ? 'shared' : 'failed';
  }
}
