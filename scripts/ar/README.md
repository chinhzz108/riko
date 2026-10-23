# Riko AR media pipeline

- `prepare_mindar_targets.py` prepares the 54 printed page targets and copies their page/video placement data to `src/data/arPageTargets.json`.
- `mindar-compile.html` compiles those page images to `public/ar/book-pages.mind` in the local browser; `write_mindar_bundle.py` receives the compiled data.
- `compress_mindar_bundle.mjs` Brotli-compresses the MindAR target file. Cloudflare Pages serves the `.mind.br` bytes with `Content-Encoding: br`; the browser transparently decodes them before MindAR reads the target data. Vite dev/preview serves decoded bytes at `/ar/book-pages.mind`.
- `transcode_videos.py` creates VP9 alpha clips from the 12 ProRes 4444 masters, keys the Riko mascot, and concatenates transparent page clips into transparent recap videos. It also creates H.264 color/matte fallbacks for Safari.
- `remove_video_backgrounds.py` uses the official lightweight rembg U2Netp ONNX model for the other 23 animal, vehicle, and weather clips. It writes transparent VP9 and Safari color/matte fallbacks. Put the 4.6 MB model at `tmp/models/u2netp.onnx` before running it.

The 12 ProRes source clips with true alpha masters are DV01, DV06, GT02, GT05, GT09, GT10, HTTN01, HTTN03, HTTN07, HTTN12, HTTN13, and HTTN15. U2Netp removes the background from the other 23 page clips. All 54 page slots use the transparent page or recap videos; Safari uses synchronized H.264 color/matte streams where VP9 alpha video is not supported.
