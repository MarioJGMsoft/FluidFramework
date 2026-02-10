/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Property types that can be logged.
 *
 * @remarks Logging entire objects is considered extremely dangerous from a telemetry point of view because people can
 * easily add fields to objects that shouldn't be logged and not realize it's going to be logged.
 * General best practice is to explicitly log the fields you care about from objects.
 * @public
 */
export type TelemetryBaseEventPropertyType = string | number | boolean | undefined;

/**
 * A property to be logged to telemetry may require a tag indicating the value may contain sensitive data.
 * This type wraps a value of the given type V in an object along with a string tag (type can be further specified as T).
 *
 * This indicates that the value should be organized or handled differently by loggers in various first or third
 * party scenarios. For example, tags are used to mark data that should not be stored in logs for privacy reasons.
 * @public
 */
export interface Tagged<V, T extends string = string> {
	value: V;
	tag: T;
}

/**
 * JSON-serializable properties, which will be logged with telemetry.
 * @public
 */
export interface ITelemetryBaseProperties {
	/**
	 * Properties of a telemetry event. They are string-indexed, and their values restricted to a known set of
	 * types (optionally "wrapped" with {@link Tagged}).
	 */
	[index: string]: TelemetryBaseEventPropertyType | Tagged<TelemetryBaseEventPropertyType>;
}

/**
 * Base interface for logging telemetry statements.
 * Can contain any number of properties that get serialized as json payload.
 * @param category - category of the event, like "error", "performance", "generic", etc.
 * @param eventName - name of the event.
 * @public
 */
export interface ITelemetryBaseEvent extends ITelemetryBaseProperties {
	category: string;
	eventName: string;
}

/**
 * Specify levels of the logs.
 * @public
 */
export const LogLevel = {
	verbose: 10, // To log any verbose event for example when you are debugging something.
	default: 20, // Default log level
	error: 30, // To log errors.
} as const;

/**
 * Specify a level to the log to filter out logs based on the level.
 * @public
 */
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Extended log levels that include additional internal levels.
 * This allows for finer-grained logging control without breaking the public API.
 * @internal
 */
export const ExtendedLogLevel = {
	verbose: 10,
	default: 20,
	essential: 25, // Between default and error - for important non-error events
	error: 30,
} as const;

/**
 * Extended log level type that includes internal levels.
 * @internal
 */
export type ExtendedLogLevel = (typeof ExtendedLogLevel)[keyof typeof ExtendedLogLevel];

/**
 * Normalizes an extended log level to a public LogLevel.
 * Maps internal levels (like essential:25) to the nearest public level.
 *
 * @param level - The extended log level to normalize
 * @returns The normalized public LogLevel
 *
 * @remarks
 * The normalization strategy maps:
 * - 10 (verbose) → 10 (verbose)
 * - 20 (default) → 20 (default)
 * - 25 (essential) → 20 (default) - rounded down for backward compatibility
 * - 30 (error) → 30 (error)
 * @internal
 */
export function normalizeLogLevel(level: ExtendedLogLevel): LogLevel {
	// Map essential (25) to default (20) for systems that don't support the extended level
	if (level === ExtendedLogLevel.essential) {
		return LogLevel.default;
	}
	// All other levels are already compatible
	return level as LogLevel;
}

/**
 * Checks if the given extended log level should be logged based on the minimum log level.
 *
 * @param level - The log level of the event
 * @param minLevel - The minimum log level threshold
 * @returns True if the event should be logged, false otherwise
 *
 * @remarks
 * This uses the actual numeric values for comparison, allowing essential (25)
 * to be correctly filtered between default (20) and error (30).
 * @internal
 */
export function shouldLogAtLevel(
	level: ExtendedLogLevel,
	minLevel: LogLevel | ExtendedLogLevel,
): boolean {
	return level >= minLevel;
}

/**
 * Checks if a given log level is an extended level (not part of the public LogLevel).
 *
 * @param level - The log level to check
 * @returns True if the level is an extended level
 * @internal
 */
export function isExtendedLogLevel(level: ExtendedLogLevel): boolean {
	return level === ExtendedLogLevel.essential;
}

/**
 * Interface to output telemetry events.
 * Implemented by hosting app / loader
 * @public
 */
export interface ITelemetryBaseLogger {
	/**
	 * Log a telemetry event, if it meets the appropriate log-level threshold (see {@link ITelemetryBaseLogger.minLogLevel}).
	 * @param event - The event to log.
	 * @param logLevel - The log level of the event. Default: {@link (LogLevel:variable).default}.
	 */
	send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void;

	/**
	 * Minimum log level to be logged.
	 * @defaultValue {@link (LogLevel:variable).default}
	 */
	minLogLevel?: LogLevel;
}

/**
 * Error telemetry event.
 * Maps to category = "error"
 *
 * @deprecated For internal use within FluidFramework, use ITelemetryErrorEventExt in \@fluidframework/telemetry-utils.
 * No replacement intended for FluidFramework consumers.
 * @public
 */
export interface ITelemetryErrorEvent extends ITelemetryBaseProperties {
	eventName: string;
}

/**
 * An error object that supports exporting its properties to be logged to telemetry
 * @legacy @beta
 */
export interface ILoggingError extends Error {
	/**
	 * Return all properties from this object that should be logged to telemetry
	 */
	getTelemetryProperties(): ITelemetryBaseProperties;
}
