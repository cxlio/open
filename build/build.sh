set -e

tsc -b
esbuild index.ts --bundle --format=esm --tsconfig=tsconfig.json --platform=node --packages=external --outfile=../dist/build/index.js
cp license-* package.json ../dist/build