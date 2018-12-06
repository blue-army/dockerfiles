# Docker image for converting markdown files to pdf

## Buiilding the image

```bash
docker build -t nullreference/md-pdf .
```

## Running the image

```bash
docker run -v `pwd`:/source -it nullreference/md-pdf /source/{path-to-markdown}
```

## Combining multiple markdown files

```bash
for f in *.md; do (cat "${f}"; echo; echo; echo '<div class="page"/>'; echo) >> combined.md; done
```