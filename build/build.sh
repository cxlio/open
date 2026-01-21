set -e

tsc -b
cp license-* ../dist/build

mkdir -p ../dist/build/package
esbuild ../spec-browser/index.ts --bundle --format=esm --platform=browser --outfile=../dist/build/spec-browser.js

node ../dist/build "$@"

cp license-* ../dist/build/package
cp ../dist/build/eslint-config.js ../dist/build/package
cp ../dist/build/spec-browser.js ../dist/build/package/spec-browser.js
cp ../node_modules/@cxl/3doc/3doc.js ../dist/build/package

