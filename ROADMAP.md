# Roadmap

A description of feature that are currently being worked on / being considered

## MVP

Everything needed for a minimal viable product. In general, this means: Cleaning things up, making it respond to files being removed / added / moved / edited.

- [x] Remove sidecar files from the file explorer (default explorer only)
- [ ] Allow users to turn of hiding sidecar files
- [ ] When opening an media file, open a side-view with 1. The media file 2. An editor window for the sidecar file
- [ ] When clicking on a file in the gallery view, do the same as above, and highlight the file
- [ ] Remove sidecar files from the graph view - possibly add sidecar tag to file
- [ ] Update gallery to use own system. The current system is quite broken
- [ ] Show a model with updates when a lot of new files have been detected; Show progress for feature extraction

## File types

Supporting more file types is the next step. Mainly, these are the things being considered:

- [ ] Video / animated files. Mp4, gif 
- [ ] Audio files. mp3, wav, etc.
- [ ] 3d files. obj, gltf - incl. embedding
- [ ] Wonderdraft and dungeondraft files - incl. embedding

## Performance

Performance for a media querying application / plugin like this is a concern. Currently, the largest bottle necks seem to be:

- [ ] Feature extraction. Feature extraction for images is quite slow. This might be because of the image loading.