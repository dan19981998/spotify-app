#!/usr/bin/env python3
import sys

with open('src/app/index.tsx', 'r') as f:
    lines = f.readlines()

# Find line with "{showOverlay && (" 
start_idx = -1
for i, line in enumerate(lines):
    if '{showOverlay && (' in line:
        start_idx = i
        print(f"Found showOverlay at line {i+1}")
        break

if start_idx == -1:
    print("Could not find showOverlay line")
    sys.exit(1)

# Find the closing )}
end_idx = start_idx
for i in range(start_idx + 1, len(lines)):
    line = lines[i]
    stripped = line.lstrip()
    
    # Look for )} at the end of a line (closing the conditional)
    if stripped.rstrip().endswith(')}'):
        end_idx = i
        print(f"Found closing at line {i+1}")
        break

print(f"Will re-indent lines {start_idx+2} to {end_idx+1}")

# Re-indent lines start_idx+1 through end_idx
for i in range(start_idx+1, end_idx+1):
    original = lines[i]
    stripped = original.lstrip()
    
    if stripped:  # Only if line has content
        # Add 8 more spaces (2 indentation levels)
        lines[i] = '        ' + original
    
# Write back
with open('src/app/index.tsx', 'w') as f:
    f.writelines(lines)

print("Fixed indentation!")
