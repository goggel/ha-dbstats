// Home Assistant can be served over HTTP, where the Clipboard API is unavailable.
export async function copyLabel(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Try the user-initiated copy command if clipboard access was denied.
        }
    }

    const focused = document.activeElement as HTMLElement | SVGElement | null;
    const field = document.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    field.style.pointerEvents = 'none';
    document.body.appendChild(field);
    try {
        field.focus({preventScroll: true});
        field.select();
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        field.remove();
        focused?.focus({preventScroll: true});
    }
}
