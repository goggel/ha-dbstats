import {copyLabel} from './copyLabel';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommand = document.execCommand;
beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: undefined});
    document.execCommand = jest.fn();
});
afterEach(() => {
    if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
        Reflect.deleteProperty(navigator, 'clipboard');
    }
    document.execCommand = originalExecCommand;
});

it('copies the exact label as plain text through the Clipboard API', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText}});
    const text = `sensor.${'long_entity_name_'.repeat(80)}é <>&"`;
    await expect(copyLabel(text)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(text);
    expect(document.execCommand).not.toHaveBeenCalled();
});

it.each(['unavailable', 'denied'])('copies on HTTP or when clipboard access is %s, cleans up and restores focus', async mode => {
    if (mode === 'denied') {
        Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: jest.fn().mockRejectedValue(new Error('Denied'))}});
    }
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    const text = 'sensor.full_original_label_é<&>';
    (document.execCommand as jest.Mock).mockImplementation(command => {
        const field = document.activeElement as HTMLTextAreaElement;
        expect(command).toBe('copy');
        expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(text);
        return true;
    });
    try {
        await expect(copyLabel(text)).resolves.toBe(true);
        expect(document.execCommand).toHaveBeenCalledTimes(1);
        expect(document.querySelector('textarea')).toBeNull();
        expect(document.activeElement).toBe(button);
    } finally {
        button.remove();
    }
});

it.each([false, new Error('Copy blocked')])('reports failure and removes the temporary field when native copy fails: %s', async result => {
    (document.execCommand as jest.Mock).mockImplementation(() => {
        if (result instanceof Error) { throw result; }
        return result;
    });
    await expect(copyLabel('sensor.example')).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
});
