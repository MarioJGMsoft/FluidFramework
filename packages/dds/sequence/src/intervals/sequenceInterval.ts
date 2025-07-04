/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	Client,
	ISegment,
	LocalReferencePosition,
	PropertiesManager,
	PropertySet,
	ReferenceType,
	SlidingPreference,
	compareReferencePositions,
	createDetachedLocalReferencePosition,
	createMap,
	getSlideToSegoff,
	maxReferencePosition,
	minReferencePosition,
	refTypeIncludesFlag,
	reservedRangeLabelsKey,
	SequencePlace,
	Side,
	endpointPosAndSide,
	addProperties,
	copyPropertiesAndManager,
	type ISegmentInternal,
	UnassignedSequenceNumber,
	UniversalSequenceNumber,
} from "@fluidframework/merge-tree/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { computeStickinessFromSide } from "../intervalCollection.js";

import {
	// eslint-disable-next-line import/no-deprecated
	ISerializableInterval,
	ISerializedInterval,
	IntervalStickiness,
	IntervalType,
	endReferenceSlidingPreference,
	startReferenceSlidingPreference,
	type SerializedIntervalDelta,
} from "./intervalUtils.js";

function compareSides(sideA: Side, sideB: Side): number {
	if (sideA === sideB) {
		return 0;
	}

	if (sideA === Side.Before) {
		return 1;
	}

	return -1;
}

function minSide(sideA: Side, sideB: Side): Side {
	if (sideA === Side.After && sideB === Side.After) {
		return Side.After;
	}

	return Side.Before;
}

function maxSide(sideA: Side, sideB: Side): Side {
	if (sideA === Side.Before && sideB === Side.Before) {
		return Side.Before;
	}

	return Side.After;
}

const reservedIntervalIdKey = "intervalId";

const legacyIdPrefix = "legacy";

export function getSerializedProperties(
	serializedInterval: ISerializedInterval | SerializedIntervalDelta,
): {
	id: string;
	labels: string[];
	properties: PropertySet;
} {
	const {
		[reservedIntervalIdKey]: maybeId,
		[reservedRangeLabelsKey]: labels,
		...properties
	} = serializedInterval.properties ?? {};
	// Create a non-unique ID based on start and end to be used on intervals that come from legacy clients
	// without ID's.
	const id =
		maybeId ?? `${legacyIdPrefix}${serializedInterval.start}-${serializedInterval.end}`;

	return { id, labels, properties };
}

/**
 * Interval implementation whose ends are associated with positions in a mutatable sequence.
 * As such, when content is inserted into the middle of the interval, the interval expands to
 * include that content.
 *
 * @remarks The endpoints' positions should be treated exclusively to get
 * reasonable behavior. E.g., an interval referring to "hello" in "hello world"
 * should have a start position of 0 and an end position of 5.
 *
 * To see why, consider what happens if "llo wor" is removed from the string to make "held".
 * The interval's startpoint remains on the "h" (it isn't altered), but the interval's endpoint
 * slides forward to the next unremoved position, which is the "l" in "held".
 * Users would generally expect the interval to now refer to "he" (as it is the subset of content
 * remaining after the removal), hence the "l" should be excluded.
 * If the interval endpoint was treated inclusively, the interval would now refer to "hel", which
 * is undesirable.
 *
 * Since the endpoints of an interval are treated exclusively but cannot be greater
 * than or equal to the length of the associated sequence, there exist special
 * endpoint segments, "start" and "end", which represent the position immediately
 * before or immediately after the string respectively.
 *
 * If a `SequenceInterval` is created on a sequence with the
 * `mergeTreeReferencesCanSlideToEndpoint` feature flag set to true, the endpoints
 * of the interval that are exclusive will have the ability to slide to these
 * special endpoint segments.
 * @alpha
 * @legacy
 */
// eslint-disable-next-line import/no-deprecated
export interface SequenceInterval extends ISerializableInterval {
	readonly start: LocalReferencePosition;
	/**
	 * End endpoint of this interval.
	 * @remarks This endpoint can be resolved into a character position using the SharedString it's a part of.
	 */
	readonly end: LocalReferencePosition;
	readonly intervalType: IntervalType;
	readonly startSide: Side;
	readonly endSide: Side;
	readonly stickiness: IntervalStickiness;

	/** Serializable bag of properties associated with the interval. */
	properties: PropertySet;

	/**
	 * @returns a new interval object with identical semantics.
	 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
	 */
	clone(): SequenceInterval;
	/**
	 * Compares this interval to `b` with standard comparator semantics:
	 * - returns -1 if this is less than `b`
	 * - returns 1 if this is greater than `b`
	 * - returns 0 if this is equivalent to `b`
	 * @param b - Interval to compare against
	 */
	compare(b: SequenceInterval): number;
	/**
	 * Compares the start endpoint of this interval to `b`'s start endpoint.
	 * Standard comparator semantics apply.
	 * @param b - Interval to compare against
	 */
	compareStart(b: SequenceInterval): number;
	/**
	 * Compares the end endpoint of this interval to `b`'s end endpoint.
	 * Standard comparator semantics apply.
	 * @param b - Interval to compare against
	 */
	compareEnd(b: SequenceInterval): number;
	/**
	 * Modifies one or more of the endpoints of this interval, returning a new interval representing the result.
	 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
	 */
	modify(
		label: string,
		start: SequencePlace | undefined,
		end: SequencePlace | undefined,
		op?: ISequencedDocumentMessage,
		localSeq?: number,
		useNewSlidingBehavior?: boolean,
	): SequenceInterval | undefined;
	/**
	 * @returns whether this interval overlaps with `b`.
	 * Intervals are considered to overlap if their intersection is non-empty.
	 */
	overlaps(b: SequenceInterval): boolean;
	/**
	 * Unions this interval with `b`, returning a new interval.
	 * The union operates as a convex hull, i.e. if the two intervals are disjoint, the return value includes
	 * intermediate values between the two intervals.
	 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
	 */
	union(b: SequenceInterval): SequenceInterval;

	/**
	 * Subscribes to position change events on this interval if there are no current listeners.
	 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
	 */
	addPositionChangeListeners(
		beforePositionChange: () => void,
		afterPositionChange: () => void,
	): void;

	/**
	 * Removes the currently subscribed position change listeners.
	 * @deprecated This api is not meant or necessary for external consumption and will be removed in subsequent release
	 */
	removePositionChangeListeners(): void;

	/**
	 * @returns whether this interval overlaps two numerical positions.
	 */
	overlapsPos(bstart: number, bend: number): boolean;

	/**
	 * Gets the id associated with this interval.
	 * When the interval is used as part of an interval collection, this id can be used to modify or remove the
	 * interval.
	 */
	getIntervalId(): string;
}

// eslint-disable-next-line import/no-deprecated
export class SequenceIntervalClass implements SequenceInterval, ISerializableInterval {
	readonly #props: {
		propertyManager?: PropertiesManager;
		properties: PropertySet;
	} = { properties: createMap<any>() };

	/**
	 * {@inheritDoc ISerializableInterval.properties}
	 */
	public get properties(): Readonly<PropertySet> {
		return this.#props.properties;
	}

	public changeProperties(
		props: PropertySet | undefined,
		op?: ISequencedDocumentMessage,
		rollback?: boolean,
	) {
		if (props !== undefined) {
			this.#props.propertyManager ??= new PropertiesManager();
			return this.#props.propertyManager.handleProperties(
				{ props },
				this.#props,
				this.client.getCollabWindow().collaborating
					? (op?.sequenceNumber ?? UnassignedSequenceNumber)
					: UniversalSequenceNumber,
				op?.minimumSequenceNumber ?? UniversalSequenceNumber,
				this.client.getCollabWindow().collaborating,
				rollback,
			);
		}
	}

	/***/
	public get stickiness(): IntervalStickiness {
		const startSegment: ISegmentInternal | undefined = this.start.getSegment();
		const endSegment: ISegmentInternal | undefined = this.end.getSegment();
		return computeStickinessFromSide(
			startSegment?.endpointType,
			this.startSide,
			endSegment?.endpointType,
			this.endSide,
		);
	}

	constructor(
		private readonly client: Client,
		private readonly id: string,
		private readonly label: string,
		/**
		 * Start endpoint of this interval.
		 * @remarks This endpoint can be resolved into a character position using the SharedString it's a part of.
		 */
		public start: LocalReferencePosition,
		/**
		 * End endpoint of this interval.
		 * @remarks This endpoint can be resolved into a character position using the SharedString it's a part of.
		 */
		public end: LocalReferencePosition,
		public intervalType: IntervalType,
		props?: PropertySet,
		public readonly startSide: Side = Side.Before,
		public readonly endSide: Side = Side.Before,
	) {
		if (props) {
			this.#props.properties = addProperties(this.#props.properties, props);
		}
	}

	private callbacks?: Record<"beforePositionChange" | "afterPositionChange", () => void>;

	/**
	 * Subscribes to position change events on this interval if there are no current listeners.
	 */
	public addPositionChangeListeners(
		beforePositionChange: () => void,
		afterPositionChange: () => void,
	): void {
		if (this.callbacks === undefined) {
			this.callbacks = {
				beforePositionChange,
				afterPositionChange,
			};

			const startCbs = (this.start.callbacks ??= {});
			const endCbs = (this.end.callbacks ??= {});
			startCbs.beforeSlide = endCbs.beforeSlide = beforePositionChange;
			startCbs.afterSlide = endCbs.afterSlide = afterPositionChange;
		}
	}

	/**
	 * Removes the currently subscribed position change listeners.
	 */
	public removePositionChangeListeners(): void {
		if (this.callbacks) {
			this.callbacks = undefined;
			this.start.callbacks = undefined;
			this.end.callbacks = undefined;
		}
	}

	/**
	 * {@inheritDoc ISerializableInterval.serialize}
	 */
	public serialize(): ISerializedInterval {
		return this.serializeDelta({
			props: this.properties,
			includeEndpoints: true,
		}) as ISerializedInterval;
	}

	public serializeDelta({
		props,
		includeEndpoints,
	}: {
		props: PropertySet | undefined;
		includeEndpoints: boolean;
	}): SerializedIntervalDelta {
		const startSegment: ISegmentInternal | undefined = this.start.getSegment();
		const endSegment: ISegmentInternal | undefined = this.end.getSegment();
		const startPosition = includeEndpoints
			? (startSegment?.endpointType ??
				this.client.localReferencePositionToPosition(this.start))
			: undefined;
		const endPosition = includeEndpoints
			? (endSegment?.endpointType ?? this.client.localReferencePositionToPosition(this.end))
			: undefined;
		return {
			end: endPosition,
			intervalType: this.intervalType,
			sequenceNumber: this.client.getCurrentSeq(),
			start: startPosition,
			stickiness: this.stickiness,
			startSide: includeEndpoints ? this.startSide : undefined,
			endSide: includeEndpoints ? this.endSide : undefined,
			properties: {
				...props,
				[reservedIntervalIdKey]: this.id,
				[reservedRangeLabelsKey]: [this.label],
			},
		} satisfies SerializedIntervalDelta;
	}

	/**
	 * {@inheritDoc IInterval.clone}
	 */
	public clone(): SequenceIntervalClass {
		return new SequenceIntervalClass(
			this.client,
			this.id,
			this.label,
			this.start,
			this.end,
			this.intervalType,
			this.properties,
			this.startSide,
			this.endSide,
		);
	}

	/**
	 * {@inheritDoc IInterval.compare}
	 */
	public compare(b: SequenceInterval) {
		const startResult = this.compareStart(b);
		if (startResult === 0) {
			const endResult = this.compareEnd(b);
			if (endResult === 0) {
				const thisId = this.getIntervalId();
				if (thisId) {
					const bId = b.getIntervalId();
					if (bId) {
						return thisId > bId ? 1 : thisId < bId ? -1 : 0;
					}
					return 0;
				}
				return 0;
			} else {
				return endResult;
			}
		} else {
			return startResult;
		}
	}

	/**
	 * {@inheritDoc IInterval.compareStart}
	 */
	public compareStart(b: SequenceInterval) {
		const dist = compareReferencePositions(this.start, b.start);

		if (dist === 0) {
			return compareSides(this.startSide, b.startSide);
		}

		return dist;
	}

	/**
	 * {@inheritDoc IInterval.compareEnd}
	 */
	public compareEnd(b: SequenceInterval): number {
		const dist = compareReferencePositions(this.end, b.end);

		if (dist === 0) {
			return compareSides(b.endSide, this.endSide);
		}

		return dist;
	}

	/**
	 * {@inheritDoc IInterval.overlaps}
	 */
	public overlaps(b: SequenceInterval) {
		const result =
			compareReferencePositions(this.start, b.end) <= 0 &&
			compareReferencePositions(this.end, b.start) >= 0;
		return result;
	}

	/**
	 * {@inheritDoc ISerializableInterval.getIntervalId}
	 */
	public getIntervalId(): string {
		return this.id;
	}

	/**
	 * {@inheritDoc IInterval.union}
	 */
	public union(b: SequenceIntervalClass) {
		const newStart = minReferencePosition(this.start, b.start);
		const newEnd = maxReferencePosition(this.end, b.end);

		let startSide: Side;

		if (this.start === b.start) {
			startSide = minSide(this.startSide, b.startSide);
		} else {
			startSide = this.start === newStart ? this.startSide : b.startSide;
		}

		let endSide: Side;

		if (this.end === b.end) {
			endSide = maxSide(this.endSide, b.endSide);
		} else {
			endSide = this.end === newEnd ? this.endSide : b.endSide;
		}

		return new SequenceIntervalClass(
			this.client,
			uuid(),
			this.label,
			newStart,
			newEnd,
			this.intervalType,
			undefined,
			startSide,
			endSide,
		);
	}

	/**
	 * @returns whether this interval overlaps two numerical positions.
	 */
	public overlapsPos(bstart: number, bend: number) {
		const startPos = this.client.localReferencePositionToPosition(this.start);
		const endPos = this.client.localReferencePositionToPosition(this.end);
		return endPos > bstart && startPos < bend;
	}

	/**
	 * {@inheritDoc IInterval.modify}
	 */
	public modify(
		label: string,
		start: SequencePlace | undefined,
		end: SequencePlace | undefined,
		op?: ISequencedDocumentMessage,
		localSeq?: number,
		useNewSlidingBehavior: boolean = false,
	) {
		const { startSide, endSide, startPos, endPos } = endpointPosAndSide(start, end);
		const startSegment: ISegmentInternal | undefined = this.start.getSegment();
		const endSegment: ISegmentInternal | undefined = this.end.getSegment();
		const stickiness = computeStickinessFromSide(
			startPos ?? startSegment?.endpointType,
			startSide ?? this.startSide,
			endPos ?? endSegment?.endpointType,
			endSide ?? this.endSide,
		);
		const getRefType = (baseType: ReferenceType): ReferenceType => {
			let refType = baseType;
			if (op === undefined) {
				refType &= ~ReferenceType.SlideOnRemove;
				refType |= ReferenceType.StayOnRemove;
			}
			return refType;
		};

		let startRef = this.start;
		if (startPos !== undefined) {
			startRef = createPositionReference(
				this.client,
				startPos,
				getRefType(this.start.refType),
				op,
				undefined,
				localSeq,
				startReferenceSlidingPreference(stickiness),
				startReferenceSlidingPreference(stickiness) === SlidingPreference.BACKWARD,
				useNewSlidingBehavior,
			);
			if (this.start.properties) {
				startRef.addProperties(this.start.properties);
			}
		}

		let endRef = this.end;
		if (endPos !== undefined) {
			endRef = createPositionReference(
				this.client,
				endPos,
				getRefType(this.end.refType),
				op,
				undefined,
				localSeq,
				endReferenceSlidingPreference(stickiness),
				endReferenceSlidingPreference(stickiness) === SlidingPreference.FORWARD,
				useNewSlidingBehavior,
			);
			if (this.end.properties) {
				endRef.addProperties(this.end.properties);
			}
		}

		const newInterval = new SequenceIntervalClass(
			this.client,
			this.id,
			this.label,
			startRef,
			endRef,
			this.intervalType,
			undefined,
			startSide ?? this.startSide,
			endSide ?? this.endSide,
		);
		copyPropertiesAndManager(this.#props, newInterval.#props);
		return newInterval;
	}

	public ackPropertiesChange(newProps: PropertySet, op: ISequencedDocumentMessage) {
		this.#props.propertyManager ??= new PropertiesManager();
		// Let the propertyManager prune its pending change-properties set.
		this.#props.propertyManager.ack(op.sequenceNumber, op.minimumSequenceNumber, {
			props: newProps,
		});
	}
}

export function createPositionReferenceFromSegoff(
	client: Client,
	segoff: { segment: ISegment; offset: number } | undefined | "start" | "end",
	refType: ReferenceType,
	op?: ISequencedDocumentMessage,
	localSeq?: number,
	fromSnapshot?: boolean,
	slidingPreference?: SlidingPreference,
	canSlideToEndpoint?: boolean,
	rollback?: boolean,
): LocalReferencePosition {
	if (segoff === "start" || segoff === "end") {
		return client.createLocalReferencePosition(
			segoff,
			undefined,
			refType,
			undefined,
			slidingPreference,
			canSlideToEndpoint,
		);
	}

	if (segoff?.segment) {
		const ref = client.createLocalReferencePosition(
			segoff.segment,
			segoff.offset,
			refType,
			undefined,
			slidingPreference,
			canSlideToEndpoint,
		);
		return ref;
	}

	// Creating references on detached segments is allowed for:
	// - Transient segments
	// - References coming from a remote client (location may have been concurrently removed)
	// - References being rebased to a new sequence number
	//   (segment they originally referred to may have been removed with no suitable replacement)
	if (
		!op &&
		!localSeq &&
		!fromSnapshot &&
		!refTypeIncludesFlag(refType, ReferenceType.Transient) &&
		!rollback
	) {
		throw new UsageError("Non-transient references need segment");
	}

	return createDetachedLocalReferencePosition(slidingPreference, refType);
}

function createPositionReference(
	client: Client,
	pos: number | "start" | "end",
	refType: ReferenceType,
	op?: ISequencedDocumentMessage,
	fromSnapshot?: boolean,
	localSeq?: number,
	slidingPreference?: SlidingPreference,
	exclusive: boolean = false,
	useNewSlidingBehavior: boolean = false,
	rollback?: boolean,
): LocalReferencePosition {
	let segoff;

	if (op) {
		assert(
			(refType & ReferenceType.SlideOnRemove) !== 0,
			0x2f5 /* op create references must be SlideOnRemove */,
		);
		if (pos === "start" || pos === "end") {
			segoff = pos;
		} else {
			segoff = client.getContainingSegment(pos, {
				referenceSequenceNumber: op.referenceSequenceNumber,
				clientId: op.clientId,
			});
			segoff = getSlideToSegoff(segoff, slidingPreference, undefined, useNewSlidingBehavior);
		}
	} else {
		assert(
			(refType & ReferenceType.SlideOnRemove) === 0 || !!fromSnapshot,
			0x2f6 /* SlideOnRemove references must be op created */,
		);
		segoff =
			pos === "start" || pos === "end"
				? pos
				: client.getContainingSegment(pos, undefined, localSeq);
	}

	return createPositionReferenceFromSegoff(
		client,
		segoff,
		refType,
		op,
		localSeq,
		fromSnapshot,
		slidingPreference,
		exclusive,
		rollback,
	);
}

export function createTransientInterval(
	start: SequencePlace | undefined,
	end: SequencePlace | undefined,
	client: Client,
) {
	return createSequenceInterval(
		"transient",
		uuid(),
		start,
		end,
		client,
		IntervalType.Transient,
	);
}

export function createSequenceInterval(
	label: string,
	id: string,
	start: SequencePlace | undefined,
	end: SequencePlace | undefined,
	client: Client,
	intervalType: IntervalType,
	op?: ISequencedDocumentMessage,
	fromSnapshot?: boolean,
	useNewSlidingBehavior: boolean = false,
	props?: PropertySet,
	rollback?: boolean,
): SequenceIntervalClass {
	const { startPos, startSide, endPos, endSide } = endpointPosAndSide(
		start ?? "start",
		end ?? "end",
	);
	assert(
		startPos !== undefined &&
			endPos !== undefined &&
			startSide !== undefined &&
			endSide !== undefined,
		0x794 /* start and end cannot be undefined because they were not passed in as undefined */,
	);
	const stickiness = computeStickinessFromSide(startPos, startSide, endPos, endSide);
	let beginRefType = ReferenceType.RangeBegin;
	let endRefType = ReferenceType.RangeEnd;
	if (intervalType === IntervalType.Transient) {
		beginRefType = ReferenceType.Transient;
		endRefType = ReferenceType.Transient;
	} else {
		// All non-transient interval references must eventually be SlideOnRemove
		// To ensure eventual consistency, they must start as StayOnRemove when
		// pending (created locally and creation op is not acked)
		if (op ?? fromSnapshot) {
			beginRefType |= ReferenceType.SlideOnRemove;
			endRefType |= ReferenceType.SlideOnRemove;
		} else {
			beginRefType |= ReferenceType.StayOnRemove;
			endRefType |= ReferenceType.StayOnRemove;
		}
	}

	const startLref = createPositionReference(
		client,
		startPos,
		beginRefType,
		op,
		fromSnapshot,
		undefined,
		startReferenceSlidingPreference(stickiness),
		startReferenceSlidingPreference(stickiness) === SlidingPreference.BACKWARD,
		useNewSlidingBehavior,
		rollback,
	);

	const endLref = createPositionReference(
		client,
		endPos,
		endRefType,
		op,
		fromSnapshot,
		undefined,
		endReferenceSlidingPreference(stickiness),
		endReferenceSlidingPreference(stickiness) === SlidingPreference.FORWARD,
		useNewSlidingBehavior,
		rollback,
	);

	const rangeProp = {
		[reservedRangeLabelsKey]: [label],
	};
	startLref.addProperties(rangeProp);
	endLref.addProperties(rangeProp);

	const ival = new SequenceIntervalClass(
		client,
		id,
		label,
		startLref,
		endLref,
		intervalType,
		props === undefined
			? undefined
			: { ...props, [reservedIntervalIdKey]: undefined, [reservedRangeLabelsKey]: undefined },
		startSide,
		endSide,
	);
	return ival;
}
