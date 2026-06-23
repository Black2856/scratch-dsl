/**
 * External-time and external-randomness seams. The Runtime never touches
 * Date.now()/performance.now() or Math.random() directly: it goes through
 * these ports so headless tests can inject deterministic fakes and so the
 * engine stays free of DOM/browser assumptions (per Phase 2 constraints).
 */
export interface ClockPort {
    /** Monotonic current time in milliseconds. */
    now(): number;
}

export interface RandomPort {
    /** Uniform random number in [0, 1), mirrors Math.random()'s contract. */
    random(): number;
}

/** Default ClockPort backed by Date.now(). Node-only, no DOM dependency. */
export class SystemClockPort implements ClockPort {
    now(): number {
        return Date.now();
    }
}

/** Default RandomPort backed by Math.random(). */
export class SystemRandomPort implements RandomPort {
    random(): number {
        return Math.random();
    }
}

/**
 * Wall-clock seam for `sensing_current` / `sensing_dayssince2000`. Separate
 * from ClockPort (which is a monotonic scheduler clock): this returns a real
 * calendar Date so date-part reporters and the days-since-2000 calculation can
 * be made deterministic in tests with a FakeWallClock.
 */
export interface WallClockPort {
    /** Current calendar date/time. */
    nowDate(): Date;
}

/**
 * User/network environment seam for `sensing_username` / `sensing_online`.
 * Headless default returns an empty username and '' (unknown) online status,
 * matching the official VM's "no audioEngine/userData" guards. A browser
 * adapter can return navigator.onLine and an injected username. This never
 * contacts the Scratch website or performs any network I/O.
 */
export interface UserEnvironmentPort {
    getUsername(): string;
    /** true/false when known, '' when unknown (headless default). */
    isOnline(): boolean | '';
}

/**
 * Microphone loudness seam for `sensing_loudness` / `event_whengreaterthan`'s
 * loudness branch. Returns 0..100, or -1 when no microphone/permission is
 * available (matching the official VM's "no audioEngine → -1"). A browser
 * adapter wires this to an AnalyserNode; headless Runtimes leave it unset and
 * loudness reads -1.
 */
export interface LoudnessPort {
    getLoudness(): number;
}

/** Default WallClockPort backed by the system clock. Node-safe (no DOM). */
export class SystemWallClockPort implements WallClockPort {
    nowDate(): Date {
        return new Date();
    }
}

/** Default UserEnvironmentPort: empty username, unknown online status. */
export class DefaultUserEnvironmentPort implements UserEnvironmentPort {
    getUsername(): string {
        return '';
    }
    isOnline(): boolean | '' {
        return '';
    }
}
