```yaml
---
title: Technical Skill Profile
role: Master Game Developer & Engine Architect
specialization: Level Design, RPG Environment Art, & High-Performance Web3D Systems
expertise_level: Master
---

```

### Core Game Engines & Architecture

Custom Engine Development
Architecting lightweight, purpose-built engines from scratch using low-level APIs, handling memory management, game loops, state machines, and entity-component systems (ECS).

Level & Map Data Serialization
Designing custom JSON, XML, or binary schemas to store map data, tile coordinates, entity spawn points, collision layers, and environmental triggers for seamless loading.

Asset Pipelines & Optimization
Setting up automated asset pipelines to compress, optimize, and bundle 3D models (glTF/GLB), textures, and audio files for minimal initial load times and runtime efficiency.

Cross-Platform Deployment
Configuring builds and build tools like Vite, Webpack, or Rollup to deploy game engine code consistently across web browsers, desktop wrappers (Electron), and mobile viewports.

### Web3D & Three.js Mastery

Three.js Scene Graph Architecture
Advanced manipulation of the scene graph, object hierarchies, matrix transformations, and implementing efficient custom rendering loops.

Memory Management & Garbage Collection
Preventing memory leaks by manually disposing of unused geometries, materials, and textures, and utilizing object pooling for frequently spawned game entities like projectiles or particle effects.

Custom Shader Development (GLSL)
Writing vertex and fragment shaders via RawShaderMaterial to create stylized water, animated foliage, dynamic weather, custom UI elements, and unique RPG magic visual effects.

Advanced Lighting & Shadow Maps
Implementing complex lighting setups including directional lights, point lights, spot lights, ambient occlusion maps, and optimizing shadow map resolutions and bias to avoid artifacting.

Post-Processing Pipelines
Designing visual depth using EffectComposer to layer post-processing passes such as Bloom, Depth of Field (DoF), Screen Space Ambient Occlusion (SSAO), Vignette, and custom color grading LUTs.

Raycasting & Spatial Indexing
Utilizing Raycasting for pixel-perfect mouse picking, environmental interaction, and implementing bounding box (AABB) checks or octrees for fast spatial partitioning in complex scenes.

### Third-Party WebGL & Utilities Ecosystem

React Three Fiber (R3F) & Drei
Building declarative, component-based 3D scenes within React environments, managing state integration, and using Drei helpers for camera controls, loaders, and staging.

Web Physics Engines
Integrating and configuring physics systems using Ammo.js, Cannon.js, or Rapier for rigid body dynamics, complex collision shapes, gravity, and trigger zones within RPG environments.

Animation Libraries
Utilizing GSAP (GreenSock) for programmatic UI, camera, and minor object tweening alongside Three.js AnimationMixer for complex, skeletal character animations.

Performance Optimization Tools
Profiling and debugging rendering bottlenecks using Spector.js for WebGL context inspection, alongside native browser performance profilers and Three.js memory statistics.

### RPG Level Design & Master Map Creation

Visual Storytelling & Composition
Designing 3D environments that guide player progression naturally using focal points, leading lines, framing, lighting contrast, and intentional scale to establish mood and lore.

Atmospheric & Environmental Art Direction
Implementing fog, skyboxes, dynamic day-night cycles, volumetric light scattering, and particle systems (dust motes, falling leaves, magical ether) to create living, breathing RPG realms.

Tile and Grid-Based Systems
Architecting both 2D/2.5D isometric tile systems and full 3D modular grid systems for rapid, cohesive building of dungeons, castles, and towns.

Terrain & Material Blending
Utilizing height-maps, vertex painting, and multi-texture blending techniques to create realistic transitions between grass, rock, dirt, and sand on large-scale RPG maps.

Prop Placement & Set Dressing
Populating levels with modular props to break repetition, adding detail layers (decals, moss, debris), and maintaining visual hierarchy to prevent environmental clutter from obscuring gameplay elements.

Level Flow & Collision Mesh Design
Structuring map layouts to control player pacing, managing invisible walls, crafting accurate but simplified collision meshes to ensure smooth navigation, and separating visual geometry from physics geometry.