
#!/usr/bin/env bash
set -Eeuo pipefail

PATCH_DIR="/app/patches"

SITE_PACKAGES="$(python -c \
  'import sysconfig; print(sysconfig.get_paths()["purelib"])')"

if [[ ! -d "$PATCH_DIR" ]]; then
    echo "ERROR: Patch directory not found: $PATCH_DIR" >&2
    exit 1
fi

shopt -s nullglob
patches=("$PATCH_DIR"/*.patch)
shopt -u nullglob

if (( ${#patches[@]} == 0 )); then
    echo "No patches found. Nothing to do."
    exit 0
fi

echo "Python package directory: $SITE_PACKAGES"
echo "Found ${#patches[@]} patch(es)."

for file in "${patches[@]}"; do
    echo
    echo "Processing: $(basename "$file")"

    # Check whether the patch can be applied without modifying files.
    if patch --batch --forward --fuzz=0 --dry-run \
        -p1 -d "$SITE_PACKAGES" < "$file"; then

        # Apply only after the dry run succeeds.
        patch --batch --forward --fuzz=0 \
            -p1 -d "$SITE_PACKAGES" < "$file"

        echo "Applied successfully."

    # If forward application fails, check whether it is already applied.
    elif patch --batch --reverse --fuzz=0 --dry-run \
        -p1 -d "$SITE_PACKAGES" < "$file"; then

        echo "Already applied; skipping."

    else
        echo "ERROR: Patch cannot be applied: $file" >&2
        echo "Check the target paths and installed package version." >&2
        exit 1
    fi
done

echo
echo "All patches processed successfully."
