import { spec } from '../spec/index.js';
import { parseParameters } from './index.js';

export default spec('program', s => {
	s.test('parseParameters', a => {
		const parameters = {
			help: { short: 'h', type: 'boolean', help: 'help' },
			version: { short: 'v', help: 'version' },
		} as const;

		a.test('single parameter', a => {
			const r1 = parseParameters(parameters, '-h');
			a.ok(r1.help);
			const r2 = parseParameters(parameters, '--help');
			a.ok(r2.help);
		});
		a.test('multiple short', a => {
			a.throws(() => {
				const r1 = parseParameters(parameters, '-hh');
				a.equal(r1.help, true);
			});

			const r2 = parseParameters(parameters, '-hv');
			a.equal(r2.help, true);
			a.equal(r2.version, true);
		});

		a.test('multiple long', a => {
			const r1 = parseParameters(parameters, '--version --help');
			a.ok(r1.help);
			a.ok(r1.version);
		});

		a.test('short with value', a => {
			const parameters = {
				help: { short: 'h', help: 'help', type: 'string' },
			} as const;
			const r1 = parseParameters(parameters, '-h test');
			a.equal(r1.help, 'test');
			const r2 = parseParameters(parameters, '-h = test');
			a.equal(r2.help, 'test');

			const r3 = parseParameters(parameters, '-h=test-val');
			a.equal(r3.help, 'test-val');

			const r4 = parseParameters(parameters, '-h= "test value"');
			a.equal(r4.help, 'test value');

			const r5 = parseParameters(parameters, '-h= "escaped \\" string"');
			a.equal(r5.help, 'escaped \\" string');
		});

		a.test('long with value', a => {
			const parameters = {
				version: { type: 'string', help: 'version' },
			} as const;

			const r1 = parseParameters(parameters, '--version test');
			a.equal(r1.version, 'test');
			const r2 = parseParameters(parameters, '--version test-with-dash');
			a.equal(r2.version, 'test-with-dash');
			const r3 = parseParameters(parameters, '--version=test');
			a.equal(r3.version, 'test');
			const r4 = parseParameters(parameters, '--version= "test value"');
			a.equal(r4.version, 'test value');

			const r5 = parseParameters(
				parameters,
				'--version "escaped \\" string"',
			);
			a.equal(r5.version, 'escaped \\" string');
		});

		a.test('Rest values', a => {
			const r1 = parseParameters(parameters, 'file/name.json');
			a.equal(r1.$[0], 'file/name.json');

			const r2 = parseParameters(parameters, '"file name.json"');
			a.equal(r2.$[0], 'file name.json');

			const r3 = parseParameters(parameters, '"file name.json" --help');
			a.equal(r3.$[0], 'file name.json');
			a.equal(r3.help, true);
		});
		a.test('Rest value with boolean', a => {
			const r4 = parseParameters(parameters, '--help "file name.json"');
			a.equal(r4.$[0], 'file name.json');
			a.equal(r4.help, true);

			const r5 = parseParameters(parameters, '--help filename');
			a.equal(r5.$[0], 'filename');
			a.equal(r5.help, true);
		});

		a.test('Complex strings', a => {
			const r = parseParameters(
				{
					browserUrl: {
						type: 'string',
						help: 'Browser runner initial URL',
					},
					startServer: {
						type: 'string',
						help: 'Start a server application while the tests are running',
					},
				},
				'--startServer "npm run start:test --prefix .." --browserUrl http://localhost:9009',
			);
			a.equal(r.browserUrl, 'http://localhost:9009');
			a.equal(r.startServer, 'npm run start:test --prefix ..');
			a.ok(r);
		});
	});

	/*s.test('parseParametersArray', a => {
		const parameters = [
			{ short: 'h', name: 'help' },
			{ short: 'v', name: 'version' },
		];

		a.test('multiple short', a => {
			const r1 = parseParametersArray(parameters, '-hh');
			a.equal(r1.length, 2);
			a.equal(r1[0].name, 'help');
			a.equal(r1[1].name, 'help');

			const r2 = parseParametersArray(parameters, '-hv');
			a.equal(r2.length, 2);
			a.equal(r2[0].name, 'help');
			a.equal(r2[1].name, 'version');
		});

		a.test('multiple long', a => {
			const r1 = parseParametersArray(parameters, '--version --help');
			a.equal(r1.length, 2);
			a.equal(r1[0].name, 'version');
			a.equal(r1[1].name, 'help');
		});

		a.test('short with value', a => {
			const r1 = parseParametersArray(parameters, '-h test');
			a.equal(r1.length, 1);
			a.equal(r1[0].name, 'help');
			a.equal(r1[0].value, 'test');
			const r2 = parseParametersArray(parameters, '-h = test');
			a.equal(r2.length, 1);
			a.equal(r2[0].name, 'help');
			a.equal(r2[0].value, 'test');

			const r3 = parseParametersArray(parameters, '-h=test-val');
			a.equal(r3.length, 1);
			a.equal(r3[0].name, 'help');
			a.equal(r3[0].value, 'test-val');

			const r4 = parseParametersArray(parameters, '-h= "test value"');
			a.equal(r4.length, 1);
			a.equal(r4[0].name, 'help');
			a.equal(r4[0].value, 'test value');

			const r5 = parseParametersArray(
				parameters,
				'-h= "escaped \\" string"'
			);
			a.equal(r5.length, 1);
			a.equal(r5[0].name, 'help');
			a.equal(r5[0].value, 'escaped \\" string');
		});

		a.test('long with value', a => {
			const r1 = parseParametersArray(parameters, '--version test');
			a.equal(r1.length, 1);
			a.equal(r1[0].name, 'version');
			a.equal(r1[0].value, 'test');
			const r2 = parseParametersArray(
				parameters,
				'--version test-with-dash'
			);
			a.equal(r2.length, 1);
			a.equal(r2[0].name, 'version');
			a.equal(r2[0].value, 'test-with-dash');
			const r3 = parseParametersArray(parameters, '--version=test');
			a.equal(r3.length, 1);
			a.equal(r3[0].name, 'version');
			a.equal(r3[0].value, 'test');
			const r4 = parseParametersArray(parameters, '--help= "test value"');
			a.equal(r4.length, 1);
			a.equal(r4[0].name, 'help');
			a.equal(r4[0].value, 'test value');

			const r5 = parseParametersArray(
				parameters,
				'--help "escaped \\" string"'
			);
			a.equal(r5.length, 1);
			a.equal(r5[0].name, 'help');
			a.equal(r5[0].value, 'escaped \\" string');
		});

		a.test('Rest values', a => {
			const r1 = parseParametersArray(parameters, 'file/name.json');
			a.equal(r1.length, 1);
			a.equal(r1[0].name, '*');
			a.equal(r1[0].value, 'file/name.json');

			const r2 = parseParametersArray(parameters, '"file name.json"');
			a.equal(r2.length, 1);
			a.equal(r2[0].name, '*');
			a.equal(r2[0].value, 'file name.json');
		});
	});*/
});
