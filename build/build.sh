set -e

tsc -b
cp license-* ../dist/build

cp ../dist/spec-browser/index.js ../dist/build/spec-browser.js

node ../dist/build "$@"

mkdir -p ../dist/build/package
cp license-* ../dist/build/package
cp ../dist/build/eslint-config.js ../dist/build/package
cp ../node_modules/@cxl/3doc/3doc.js ../dist/build/package
cp ../dist/spec-browser/index.js ../dist/build/package/spec-browser.js

