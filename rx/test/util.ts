import {
	Observable,
	BehaviorSubject,
	Subject,
	firstValueFrom,
} from '../index.js';
import { TestApi } from '@cxl/spec';

interface Log {
	events: string;
}

class Scheduler extends BehaviorSubject<number> {
	run() {
		let maxCycles = 100;
		while (this.observers.size && maxCycles-- > 0) {
			this.next(this.value + 1);
		}
		eof$.next(this.value);
		this.next(0);
	}
}

const scheduler = new Scheduler(0);
const eof$ = new Subject<number>();

function logOperator() {
	const log: Log = { events: '' };
	let events: string[] = [];
	let time = scheduler.value;

	function flush(schedulerTime = scheduler.value) {
		let diff = schedulerTime - time;
		if (events.length) {
			log.events +=
				events.length > 1 ? `(${events.join('')})` : events[0];
			events = [];
			diff--;
		}
		if (diff > 0) log.events += '-'.repeat(diff);
	}

	function emit(ev: string) {
		const diff = scheduler.value - time;
		if (diff) {
			flush();
			time = scheduler.value;
		}

		events.push(ev);
	}

	return (source: Observable<unknown>) =>
		new Observable<Log>(subscriber => {
			const eofSub = eof$.subscribe(t => {
				flush(t);
				subscriber.next(log);
				subscriber.complete();
			});
			subscriber.signal.subscribe(() => eofSub.unsubscribe());
			source.subscribe({
				next(val) {
					emit(String(val));
				},
				error() {
					emit('#');
					flush();
					subscriber.next(log);
					subscriber.complete();
				},
				complete() {
					emit('|');
					flush();
					subscriber.next(log);
					subscriber.complete();
				},
				signal: subscriber.signal,
			});
		});
}

export function logEvents(observable: Observable<unknown>) {
	const result = firstValueFrom(observable.pipe(logOperator()));
	scheduler.run();
	return result;
}

export function expectLog(
	a: TestApi,
	obs: Observable<unknown>,
	events: string,
) {
	return logEvents(obs).then(result => {
		a.equal(result.events, events);
		return result;
	});
}

class ColdObservable extends Observable<string> {
	subscriptions = '';
	time = scheduler.value;
	lastLogPos = 0;

	/* 
   The `log` method is responsible for maintaining a textual representation of the 
   subscription's activity over simulated time, stored in the `subscriptions` string. 
   
   - If the time difference (`diff`) since the last recorded event is zero and 
     there are already logged subscriptions, it updates the previous event by 
     wrapping it in parentheses, grouping it with the new event (`ev`).
   - If the time difference (`diff`) is greater than zero, it appends spaces to 
     represent the passage of time and logs the new event, adjusting the 
     `lastLogPos` marker accordingly.

   This method is fundamental for visualizing subscription and emission events 
   in a timeline-friendly format.
	*/
	log(ev: string) {
		const diff = scheduler.value - this.time;
		const subs = this.subscriptions;
		if (diff === 0 && subs.length)
			this.subscriptions =
				subs.charAt(this.lastLogPos) === '('
					? subs.slice(0, subs.length - 1) + ev + ')'
					: subs.slice(0, this.lastLogPos) +
					  '(' +
					  subs.slice(this.lastLogPos) +
					  ev +
					  ')';
		else {
			this.subscriptions +=
				(diff > 0 ? ' '.repeat(diff - (subs ? 1 : 0)) : '') + ev;
			this.lastLogPos = this.subscriptions.length - ev.length;
		}
		this.time = scheduler.value;
	}

	constructor(
		stream: string,
		values?: Record<string, string>,
		error?: unknown,
	) {
		super(subs => {
			this.log('^');
			let emitUnsub = true;
			const iter = stream[Symbol.iterator]();

			function handleEvent(value: string) {
				if (value === '|') subs.complete();
				else if (value === '#') subs.error(error);
				else if (value !== '-')
					subs.next((values && values[value]) || value);
			}

			function handleGroup() {
				const n = iter.next();
				if (n.value && n.value !== ')') {
					handleEvent(n.value);
					handleGroup();
				}
			}

			function next() {
				const { done, value } = iter.next();

				if (done) {
					emitUnsub = false;
					inner.unsubscribe();
				} else if (value === '(') handleGroup();
				else handleEvent(value);
			}

			const inner = scheduler.subscribe(next);
			subs.signal.subscribe(() => {
				if (emitUnsub) this.log('!');
				inner.unsubscribe();
			});
		});
	}
}

export function cold(
	stream: string,
	values?: Record<string, string>,
	error?: unknown,
) {
	return new ColdObservable(stream, values, error);
}

export function replaceValues(src: string, values: Record<string, string>) {
	return src.replace(/./g, c => values[c] || c);
}

declare let clearInterval: (n: number) => void;
declare let setInterval: (fn: () => unknown, n?: number) => number;
declare let setTimeout: (fn: (a?: unknown) => unknown, n?: number) => number;
declare let clearTimeout: (n: number) => void;

export function mockSetInterval(fn: (advance: (ms: number) => void) => void) {
	let id = 0;
	let lastCalled = 0;
	const intervals: Record<number, { cb: () => void; delay: number }> = {};
	const originalSet = setInterval;
	const originalClear = clearInterval;

	setInterval = (cb: () => unknown, delay = 0): number => {
		intervals[++id] = { cb, delay };
		return id;
	};
	clearInterval = (id: number) => {
		delete intervals[id];
	};

	fn((ms: number) => {
		const elapsedTime = ms - lastCalled;
		for (const { cb, delay } of Object.values(intervals)) {
			const timesToFire = Math.floor(elapsedTime / delay);
			for (let i = 0; i < timesToFire; i++) cb();
			lastCalled = Math.floor(ms / delay) * delay;
		}
	});

	setInterval = originalSet;
	clearInterval = originalClear;
}

export function mockSetTimeout(fn: (advance: (ms: number) => void) => void) {
	let id = 0;
	const timeouts: Record<number, { cb: () => void; time: number }> = {};
	const originalSet = setTimeout;
	const originalClear = clearTimeout;

	setTimeout = (cb: (a?: unknown) => unknown, time = 0): number => {
		timeouts[++id] = { cb, time };
		return id;
	};
	clearTimeout = (id: number) => {
		delete timeouts[id];
	};

	fn((ms: number) => {
		for (const [key, { cb, time }] of Object.entries(timeouts)) {
			if (time <= ms) {
				cb();
				delete timeouts[+key];
			} else {
				timeouts[+key].time -= ms;
			}
		}
	});

	setTimeout = originalSet;
	clearTimeout = originalClear;
}
