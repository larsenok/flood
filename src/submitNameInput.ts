export interface SubmitNameUpdate {
  consumed: boolean;
  submit: boolean;
  close: boolean;
  nextDraft: string;
}

export function handleSubmitNameKey(key: string, currentDraft: string): SubmitNameUpdate {
  if (key === 'Escape') {
    return { consumed: true, submit: false, close: true, nextDraft: currentDraft };
  }
  if (key === 'Enter') {
    return { consumed: true, submit: true, close: false, nextDraft: currentDraft };
  }
  if (key === 'Backspace') {
    return { consumed: true, submit: false, close: false, nextDraft: currentDraft.slice(0, -1) };
  }
  if (/^[a-zA-Z]$/.test(key) && currentDraft.length < 3) {
    return { consumed: true, submit: false, close: false, nextDraft: `${currentDraft}${key.toUpperCase()}` };
  }
  return { consumed: true, submit: false, close: false, nextDraft: currentDraft };
}
