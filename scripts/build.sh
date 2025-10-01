
# iterate through current dir subdirectories, if package.json found run `npm run build` command
set -e
npm run build --prefix build

for dir in */; do
  [ -d "$dir" ] || continue
  if [ -f "$dir/package.json" ]; then
    echo "Building ${dir%/}..."
    (cd "$dir" && npm run build package docs)
  fi
done