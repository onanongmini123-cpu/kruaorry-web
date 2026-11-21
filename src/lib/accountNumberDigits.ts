/** What to copy to the clipboard: digits only, so it pastes into a banking app. */
export const accountNumberDigits = (accountNumber: string): string => accountNumber.replace(/\D/g, "");
