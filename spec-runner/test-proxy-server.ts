import { createServer } from 'http';

const server = createServer((request, response) => {
	let body = '';
	request.setEncoding('utf8');
	request.on('data', (chunk: string) => (body += chunk));
	request.on('end', () => {
		response.end(`${request.method} ${request.url} ${body}`);
	});
});

server.listen(Number(process.argv[2]), '127.0.0.1');
