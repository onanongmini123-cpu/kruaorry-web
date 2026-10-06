/**
 * The build that is running, for support and problem reports. Set at build
 * time by next.config.ts as "<package version>+<short commit>" (the commit is
 * "local" for a developer build). It identifies code, never a person.
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
