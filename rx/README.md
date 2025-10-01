# @cxl/rx 
	
[![npm version](https://badge.fury.io/js/%40cxl%2Frx.svg)](https://badge.fury.io/js/%40cxl%2Frx)

A lightweight reactive programming library focused on usability, performance, and type safety.

## Project Details

-   Branch Version: [1.0.0](https://npmjs.com/package/@cxl/rx/v/1.0.0)
-   License: Apache-2.0
-   Documentation: [Link](https://cxlio.github.io/open/rx)
-   Report Issues: [Github](https://github.com/cxlio/open/issues)

## Installation

	npm install @cxl/rx

## Features

-   **Observable Implementation**: Core observable functionality for representing asynchronous or event-based streams.
-   **Subjects**: Includes `Subject`, `OrderedSubject`, `BehaviorSubject`, `ReplaySubject`, and `Reference` for various use cases.
-   **Operators**: A rich collection of operators for transforming, filtering, combining, and composing observables.
-   **Utility Functions**: Includes tools like `pipe`, `from`, `of`, `concat`, `merge`, and more for observable creation and composition.
-   **Built-in Cancellation**: Leverages cancellation signals for efficient resource management and clean teardown.
-   **Promise Interoperability**: Convert promises to observables and vice versa seamlessly.
-   **Minimal Dependencies**: Designed for high performance with no external dependencies.

## Installation

Install the package via npm:

```sh
npm install @cxl/rx
```

Or with yarn:

```sh
yarn add @cxl/rx
```

## Getting Started

### Create an Observable

```typescript
import { observable } from '@cxl/rx';

const myObservable = observable(observer => {
	observer.next('Hello');
	observer.next('World');
	observer.complete();
});

myObservable.subscribe({
	next: value => console.log(value),
	complete: () => console.log('Done'),
});
```

### Using Operators

```typescript
import { of } from '@cxl/rx';

of(1, 2, 3, 4)
	.map(x => x * 2),
	.filter(x => x > 4),
	.subscribe(console.log); // Outputs: 6, 8
```

### Creating a Subject

```typescript
import { subject } from '@cxl/rx';

const mySubject = subject<number>();

mySubject.subscribe({
	next: value => console.log(`Observer 1: ${value}`),
});

mySubject.next(1);
mySubject.next(2);

mySubject.subscribe({
	next: value => console.log(`Observer 2: ${value}`),
});

mySubject.next(3);
```

## Utilities

### Cancellation Signals

External cancellation mechanisms for better control:

```typescript
import { cancel, timer } from '@cxl/rx';

const signal = cancel();

timer(5000).subscribe({
	next: () => console.log('Completed after 5s'),
	signal, // Link the cancellation signal
});

// Cancel the timer before it completes
signal.next();
```

### Promise Interactions

Convert promises into observables:

```typescript
import { fromPromise } from '@cxl/rx';

const observable = fromPromise(Promise.resolve('Hello World'));

observable.subscribe(console.log); // Outputs: Hello World
```
