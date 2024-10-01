/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { LoggingError } from "@FluidFramework/packages/utils/telemetry-utils/src/errorLogging.tss";
/**
 * Base class for "trusted" errors we create, whose properties can generally be logged to telemetry safely.
 * All properties set on the object, or passed in (via the constructor or addTelemetryProperties),
 * will be logged in accordance with their tag, if present.
 *
 * PLEASE take care to avoid setting sensitive data on this object without proper tagging!
 *
 * @internal
 */
export class LoggingError
	extends Error
	implements ILoggingError, Omit<IFluidErrorBase, "errorType">
{
	private _errorInstanceId = uuid();
	public get errorInstanceId(): string {
		return this._errorInstanceId;
	}
	public overwriteErrorInstanceId(id: string): void {
		this._errorInstanceId = id;
	}

	/**
	 * Create a new LoggingError
	 * @param message - Error message to use for Error base class
	 * @param props - telemetry props to include on the error for when it's logged
	 * @param omitPropsFromLogging - properties by name to omit from telemetry props
	 */
	public constructor(
		message: string,
		props?: ITelemetryBaseProperties,
		private readonly omitPropsFromLogging: Set<string> = new Set(),
	) {
		super(message);

		// Don't log this list itself, or the private _errorInstanceId
		omitPropsFromLogging.add("omitPropsFromLogging");
		omitPropsFromLogging.add("_errorInstanceId");

		if (props) {
			this.addTelemetryProperties(props);
		}
	}

	/**
	 * Determines if a given object is an instance of a LoggingError
	 * @param object - any object
	 * @returns true if the object is an instance of a LoggingError, false if not.
	 */
	public static typeCheck(object: unknown): object is LoggingError {
		if (typeof object === "object" && object !== null) {
			return (
				typeof (object as LoggingError).addTelemetryProperties === "function" &&
				typeof (object as LoggingError).getTelemetryProperties === "function" &&
				typeof (object as LoggingError).errorInstanceId === "string"
			);
		}
		return false;
	}

	/**
	 * Add additional properties to be logged
	 */
	public addTelemetryProperties(props: ITelemetryPropertiesExt): void {
		copyProps(this, props);
	}

	/**
	 * Get all properties fit to be logged to telemetry for this error
	 */
	public getTelemetryProperties(): ITelemetryBaseProperties {
		// Only pick properties fit for telemetry out of all of this object's enumerable properties.
		const telemetryProps: ITelemetryBaseProperties = {};
		for (const key of Object.keys(this)) {
			if (this.omitPropsFromLogging.has(key)) {
				continue;
			}
			const val = this[key] as
				| TelemetryEventPropertyTypeExt
				| Tagged<TelemetryEventPropertyTypeExt>;

			// Ensure only valid props get logged, since props of logging error could be in any shape
			telemetryProps[key] = convertToBasePropertyType(val);
		}
		// Ensure a few extra props always exist
		return {
			...telemetryProps,
			stack: this.stack,
			message: this.message,
			errorInstanceId: this._errorInstanceId,
		};
	}
}

/**
 * A browser friendly assert library.
 * Use this instead of the 'assert' package, which has a big impact on bundle sizes.
 * @param condition - The condition that should be true, if the condition is false an error will be thrown.
 * Only use this API when `false` indicates a logic error in the problem and thus a bug that should be fixed.
 * @param message - The message to include in the error when the condition does not hold.
 * A number should not be specified manually: use a string.
 * Before a release, policy-check should be run, which will convert any asserts still using strings to
 * use numbered error codes instead.
 * @legacy
 * @alpha
 */
export function assert(condition: boolean, message: string | number): asserts condition {
	if (!condition) {
		throw new Error(
			typeof message === "number" ? `0x${message.toString(16).padStart(3, "0")}` : message,
		);
	}
}
