# Hunyuan3D 2 MV engine plugin

Local multi-view geometry generation with [Hunyuan3D 2 MV](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/f8db63096c8282cb27354314d896feba5ba6ff8a/examples/textured_shape_gen_multiview.py). One to four named views: front, back, left, right. Top views are not supported. Background removal uses BiRefNet. Parameters follow the single-view Hunyuan3D 2 plugin.

Activate in Models > Engines after reviewing the Tencent license and requirements, or use `npm run plugin:install -- hunyuan3d-2-mv --accept-license`. No weights or vendor code are bundled. Requires Python 3.11, Git, CUDA and at least 8 GB VRAM; multi-view peak usage depends on resolution and view count. Real GPU generation has not yet been validated for this plugin.

The MIT wrapper is separate from Tencent code and weights. The Tencent Hunyuan 3D 2.0 Community License does not apply in the European Union, United Kingdom or South Korea. Install only if you have the right to use it. Activation and weight downloads require explicit license acknowledgement.

Pinned code: `f8db63096c8282cb27354314d896feba5ba6ff8a`. Weights: `tencent/Hunyuan3D-2mv@3a761b539b29fe4ff64714813aa9560fd66f5de0`. Config SHA-256 is computed from that revision; safetensors checksum and size come from Hugging Face LFS metadata. BiRefNet pins match the single-view plugin. Inference loads verified local safetensors through `from_single_file` and never downloads weights.
