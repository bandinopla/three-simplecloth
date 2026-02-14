import * as THREE from "three/webgpu";
import { SimpleCloth } from "../src";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import WebGPU from "three/examples/jsm/capabilities/WebGPU.js";
import { color, pass, sin, time, uv } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { afterImage } from "three/examples/jsm/tsl/display/AfterImageNode.js";

function bgGradient() {
    // create gradient texture with canvas
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = size;

    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, "#666"); // top
    gradient.addColorStop(1, "#444"); // bottom

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; // comment this if colors look wrong
    return texture;
}

async function main() {
    // --- Renderer ---
    const renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;  

    const inspector = new Inspector();

    renderer.inspector = inspector;

    document.body.appendChild(renderer.domElement);
    await renderer.init();

    let onEnterFrame: ((delta: number) => void) | undefined;

    // --- Scene ---
    const scene = new THREE.Scene();

    scene.background = bgGradient();
    scene.add(new THREE.GridHelper(2, 10));
	scene.add(new THREE.AxesHelper(.2));

    // --- Camera ---
    const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        100,
    );
    camera.position.set(0, 0.5, 2);
    camera.lookAt(0, 0, 0);

	const post = new THREE.PostProcessing(renderer);
	const renderPass = pass(scene, camera);
	const bloomPass = bloom(renderPass, 1, 1, 0.8)
	post.outputNode = afterImage( renderPass.add( bloomPass ), 0.6 );

    // --- Lighting ---
    const rim = new THREE.PointLight(0xffffff, 10, 14);
    rim.position.set(-1, 1, -3);
    scene.add(rim);

    const dl = new THREE.DirectionalLight();
    dl.castShadow = true;
    dl.position.set(4, 5, 2);
    dl.shadow.bias = -0.0009;
    dl.shadow.camera.far = 11;
    const ssize = 2;
    dl.shadow.mapSize = new THREE.Vector2(1024 * 2, 1024 * 2);
    dl.shadow.camera.top = -ssize;
    dl.shadow.camera.bottom = ssize;
    dl.shadow.camera.left = -ssize;
    dl.shadow.camera.right = ssize;

    scene.add(dl);
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));

	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.rotateSpeed = 0.5;
	controls.autoRotate = true;
	controls.autoRotateSpeed = 0.5;
    // --- Cloth ---

    new GLTFLoader().load("dance.glb", (gltf) => {
        scene.add(gltf.scene);
        scene.traverse((o) => {
            if (o instanceof THREE.SkinnedMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
            } else if ("isCamera" in o) {
 
				
                camera.position.copy(o.position);
                camera.quaternion.copy(o.quaternion);
                camera.fov = o.fov;
                camera.updateProjectionMatrix();
 
				controls.target.set(0,.8,0)
				controls.update()
            }
        });

        const rig = scene.getObjectByName("Armature001")!;
        const mixer = new THREE.AnimationMixer(rig);
        const clip = gltf.animations[0];
        mixer.clipAction(clip).play().fadeIn(3);

        //
        // ------------ CLOTH MAGIC --------------
        //

        /**
         * The piece of cloth we want to simulate ( it is vertex painted red on the cloth parts white on the non cloth )
         */
        const clothing = rig.getObjectByName("adress")! as THREE.SkinnedMesh;
        const hair = rig.getObjectByName("hair")! as THREE.SkinnedMesh;

        const cloth = SimpleCloth.onSkinnedMesh(clothing, renderer, {
            colorAttributeName: "color_1",
            collidersRoot: rig,
            colliderRadiusMultiplier: 1.4,
            windPerSecond: new THREE.Vector3(0.01, 0, 0),
        });

		const hairCloth = SimpleCloth.onSkinnedMesh(hair, renderer, {
            colorAttributeName: "color_1",
            collidersRoot: rig,
            colliderRadiusMultiplier: 1.4,
            windPerSecond: new THREE.Vector3(0, 0, 0),
        });

		const hairMaterial = (hair.material as THREE.MeshNormalNodeMaterial)
		hairMaterial.colorNode = sin(uv().x.mul(22).add(time.mul(-19).add( sin(uv().y.mul(4)).mul(3) ))) .mul(19).mul( uv().x.pow(2)   ).mul( color("cyan").mul(2)); 

        /**
         * Add settings to play with...
         */
        const folder = inspector.createParameters("cloth");
        folder
            .add(cloth.stiffnessUniform, "value", 0.1, 0.6, 0.01)
            .name("stiffness")
			.onChange(v => {
				hairCloth.stiffnessUniform.value = v;
			});
        folder
            .add(cloth.dampeningUniform, "value", 0.01, 1, 0.01)
            .name("dampening")
			.onChange(v => {
				hairCloth.dampeningUniform.value = v;
			});
        folder
            .add(cloth.gravityUniform.value, "y", -1, 0, 0.01)
            .name("gravity")
			.onChange(v => {
				hairCloth.gravityUniform.value.y = v;
			});
			;
        folder.add(cloth.windUniform.value, "x", -0.1, 0.1, 0.01).name("wind")
			.onChange(v => {
				console.log(v)
				hairCloth.windUniform.value.x = v;
			}); 

        onEnterFrame = (delta) => {
            mixer.update(delta);
            cloth.update(delta, 11);
			hairCloth.update(delta, 11);
        };
    });

    // --- Resize ---
    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // --- Animate ---
    const clock = new THREE.Clock();

    renderer.setAnimationLoop(() => {
        const delta = clock.getDelta();
		controls.update();
        onEnterFrame?.(delta);
        //renderer.render(scene, camera);
		post.render()
    });
}

if (WebGPU.isAvailable()) {
    // Initiate function or other initializations here
    main();

    const sourceBtn = document.createElement("button");
    sourceBtn.classList.add("source-btn");
    sourceBtn.textContent = "</>";
    sourceBtn.addEventListener("click", () => {
        window.open("https://github.com/bandinopla/three-simplecloth/blob/main/playground/main.ts");
    });
    document.body.appendChild(sourceBtn);
} else {
    const warning = WebGPU.getErrorMessage();
    document.body.appendChild(warning);
}
