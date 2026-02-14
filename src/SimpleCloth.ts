import {
    BufferAttribute,
    DoubleSide,
    Material,
    Matrix4,
    Mesh,
    Object3D,
    Scene,
    Skeleton,
    Texture,
    Vector3,
    type SkinnedMesh,
} from "three";
import { ShaderCallNodeInternal } from "three/src/nodes/TSL.js";
import {
    attribute,
    cameraProjectionMatrix,
    cameraViewMatrix,
    computeSkinning,
    Fn,
    If,
    instancedArray,
    instanceIndex,
    Loop,
    mix,
    objectWorldMatrix,
    Return,
    select,
    storage,
    time,
    triNoise3D,
    uniform,
    vec4,
    float,
	frontFacing,
	cross,
	transformNormalToView,
	texture,
	color,
} from "three/tsl";
import {
	MeshPhysicalNodeMaterial,
    Node,
    NodeMaterial,
    StorageInstancedBufferAttribute,
    type WebGPURenderer,
} from "three/webgpu";

const v = new Vector3();

type Collider = {
	radius:number,
	position:Object3D|Vector3
}

// function hash3(a: number, b: number, c: number) {
//     const q = 1e6; // precision control
//     let x = (a * q) | 0;
//     let y = (b * q) | 0;
//     let z = (c * q) | 0;

//     let h = x * 374761393 + y * 668265263 + z * 2147483647;
//     h = (h ^ (h >> 13)) * 1274126177;
//     h = h ^ (h >> 16);

//     return h >>> 0;
// } 

/**
 * Here we calculate the geometry of the cloth.
 * We need to know the unique vertices, the springs (edges), and the faces.
 * 
 * @param mesh The mesh to calculate the geometry of.
 * @param $maskAttribute The attribute to use as a mask (default: "color").
 * @returns An object containing the information for the cloth
 */
function calculateGeometry(mesh: Mesh, $maskAttribute = "color") {
    const geometry = mesh.geometry;
    const pos = geometry.attributes.position;

	/**
	 * The vertex paint info. We assume you pain in red, and blender's default background is white. 
	 * So we will use the blue channel to determine the weight of the cloth.
	 */
    const mask = geometry.getAttribute($maskAttribute);

    const count = pos.count;

    // Map of position string -> unique index
    const map = new Map<string, number>();
    const springPerVertex = new Map<number, number[]>();

    // Array to store the unique index for each vertex
    const indices = new Uint32Array(count);

    const vPos: number[] = [];
  
    const vVertexToFace: number[] = [];
    const vFaces: number[][] = [];

    let uniqueCount = 0;
    const v = new Vector3();

    //
    // identify unique vertices (because some may be repeated but actually the same spacial vertex)
    //
    for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        // Defaults to 0 if mask is missing. 
        // Logic: 1 = Pinned (Skin), 0 = Simulated (Cloth)
        const weight = mask ? mask.getY(i) : 0; 

        // Create a unique key for the position
        const key = `${x},${y},${z}`;// hash3(x, y, z);

        if (!map.has(key)) {
            map.set(key, uniqueCount);

            //
            // convert to world space.
            //
            v.set(x, y, z);

			

			const w = `${v.toArray()} ---> ${mesh.scale.toArray()} /// `;
     
v.applyMatrix4(mesh.matrixWorld)
			console.log(w, v.toArray());

            vPos.push(v.x, v.y, v.z, weight);
         
            uniqueCount++;
        }

        indices[i] = map.get(key)!;
    }

    //
    // now, create the "springs" ( the connections between them )
    //
    const springs: number[] = []; // unique index id of a A-B vertex pair.
    const springRestLengths: number[] = []; // length that the A-B pair must keep from each other.
    const vA = new Vector3();
    const vB = new Vector3();
    const springDefined = new Set<string>();

    const addSpringToVertex = (vertex: number, springID: number) => {
        if (springPerVertex.has(vertex)) {
            springPerVertex.get(vertex)!.push(springID);
        } else {
            springPerVertex.set(vertex, [springID]);
        }
    };

    const addSpring = (A: number, B: number) => {
        const hash = A + "-" + B; //(A * 73856093) ^ (B * 19349663);
        const hash2 = B + "-" + A; //(B * 73856093) ^ (A * 19349663);

        if (springDefined.has(hash) || springDefined.has(hash2)) {
            return;
        }

        const springID = springs.length/2;

        springs.push(A, B);

        addSpringToVertex(A, springID);
        addSpringToVertex(B, springID); 
		 
        springRestLengths.push(0);

        springDefined.add(hash);
    };

    //
    // now for each triangle, create a spring from each edge...
    //
	/**
	 * 
	 */
    const gIndices = geometry.index!.array;


    for (let i = 0; i < gIndices.length; i += 3) {
        const Ai = indices[gIndices[i]];
        const Bi = indices[gIndices[i + 1]];
        const Ci = indices[gIndices[i + 2]];

        //AB  BC  CA  | rest length + force
        addSpring(Ai, Bi);
        addSpring(  Ci, Bi,);
        addSpring( Ai , Ci, );

        // This is a face... make all indices point to these 3 indices...
        const faceIndex = vFaces.length;

        // Add the "face" to the face index
        vFaces.push([Ai, Bi, Ci]);

		vVertexToFace[gIndices[i]] = faceIndex;
		vVertexToFace[gIndices[i+1]] = faceIndex;
		vVertexToFace[gIndices[i+2]] = faceIndex;
    } 

    //
    // build springs pointer array (adjacency list)
    // This allows O(1) lookup of springs for each vertex in the shader
    //
    const springsPerVertexArray: number[] = [];
    const springsPointer = new Uint32Array(uniqueCount);
    
    for (let i = 0; i < uniqueCount; i++) {
        springsPointer[i] = springsPerVertexArray.length;
        const springsForV = springPerVertex.get(i) || [];
        // Store count, then the spring IDs
		if( springsForV.length==0 )
		{
			debugger
		}
        springsPerVertexArray.push(springsForV.length, ...springsForV);
    }
  

    return {
        vFaces: new Uint32Array(vFaces.flat()), //vec3[]
        vVertexToFace: new Uint32Array(vVertexToFace), // uint

        springsPointer: new Uint32Array(springsPointer),
        springsPerVertexArray: new Uint32Array(springsPerVertexArray),

        uniqueCount, // unique vertices
        indices, // for each vertice, stores the index of the unique one in the vPos array
        vPos: new Float32Array(vPos), // 4 components, a vector 3 positions of the unique vertices ( in world space ) + the weight

        springs: new Uint32Array(springs), // Pair of index points in vPos representing a spring
        restLengths: new Float32Array(springRestLengths), //rest lengths of each spring ( in world space )
    };
}

type ClothConfig = {

	/**
	 * Usually it is "color" but sometimes it may be other like "color_1"
	 */
	colorAttributeName?: string;

	/**
	 * Log stats to the console ( about the cloth mesh )
	 */
	logStats?: boolean;

	/**
	 * The root object to search for colliders. 
	 */
	collidersRoot?: Object3D;

	stiffness?: number;
	dampening?: number;

	/**
	 * you can tweak the radius of the colliders ( which are spheres attached to bones )
	 * 
	 * @param radius 1.0 is the default
	 */
	colliderRadiusMultiplier?: number; 

	/**
	 * Wind DIRECTION in world space (noise will be used to add variation)
	 */
	windPerSecond?:Vector3

	/**
	 * Gravity force in world space
	 */
	gravityPerSecond?:Vector3 

	/**
	 * The material used by the SkinnedMesh to turn into "cloth" must apply and use these TSL nodes...
	 * By default it will try to guess the most common case when you import a model from blender...
	 * 
	 * @param vertexNode 
	 * @param normalNode 
	 * @returns 
	 */
	updateMaterial: ( base:Material, vertexNode:Node, normalNode:Node ) => NodeMaterial
}

/**
 * Looks for objects ( empty uniformlyscaled Spheres from blender ) with a userData.stickto = "name of a bone"
 * @param root 
 * @returns 
 */
function getCollidersFrom( root:Object3D, skeleton:Skeleton, multiplier:number =1)
{
	const colliders:Collider[] = []; 
	let scene:Scene;

	root.traverseAncestors((o)=>{
		if( o instanceof Scene ){
			scene = o;
		}
	});

	//
	// collect colliders
	//
	root.traverse((o)=>{
		if( o.userData.stickto )
		{
			colliders.push({
				position: o,
				radius: 0, 
			});
		}
	}); 

	//
	// attatch to skeleton and calculate world dimension
	//
	colliders.forEach( col => {
		const bone = skeleton.getBoneByName( (col.position as Object3D).userData.stickto.replaceAll(/[\.\:]/g,"") );
		const obj = col.position as Object3D;

		if(!bone){
			throw new Error("Bone not found for collider: " + obj.userData.stickto)+ " ???";
		} 
		
		scene.attach(obj);
		
		//
		// the world scale is the radius of the collider ( uniform scale assumed!! )
		//
		col.radius = Math.abs( obj.getWorldScale(v).x ) * multiplier ;
	 

		bone!.attach( obj );
		//test... 

	} );


	return colliders;
}

function assumeTheModelCameFromBlenderAndWasTexturedNormally(base:Material, vertexNode:ShaderCallNodeInternal, normalNode:ShaderCallNodeInternal ) {
	if( "isNodeMaterial" in base )
	{
		const m = base as NodeMaterial;
		m.vertexNode = vertexNode;
		m.normalNode = normalNode;
		return m;
	}
	else 
	{
		const m = new MeshPhysicalNodeMaterial({ 
			side: DoubleSide,
			// wireframe:true,  
			wireframe: base.wireframe,
			flatShading: base.flatShading,
			transparent: base.transparent,
			depthWrite: base.depthWrite,
			depthTest: base.depthTest,
		});
		m.vertexNode = vertexNode;
		m.normalNode = normalNode;

		m.color = base.color;
		m.map = base.map;

		m.emissive = base.emissive;
		m.emissiveMap = base.emissiveMap;
		m.emissiveIntensity = base.emissiveIntensity;

		m.roughness = base.roughness;
		m.roughnessMap = base.roughnessMap;

		m.metalness = base.metalness;
		m.metalnessMap = base.metalnessMap;

		m.normalMap = base.normalMap;
		m.normalScale = base.normalScale;

		m.alphaMap = base.alphaMap;
		m.opacity = base.opacity;
		m.transparent = base.transparent;

		m.aoMap = base.aoMap;


		return m; 
	} 
}

function setupClothOnSkinnedMesh(
    mesh: SkinnedMesh,
    renderer: WebGPURenderer,
	config?: Partial<ClothConfig>, 
) {
	mesh.updateWorldMatrix(true, false);

	
	const $cfg : ClothConfig = {
		colorAttributeName: "color",
		logStats: false,
		stiffness: 0.4,
		dampening: 0.5,
		colliderRadiusMultiplier:1,
		windPerSecond: new Vector3(0,0,0),
		gravityPerSecond: new Vector3(0, -0.3,0), 
		updateMaterial: assumeTheModelCameFromBlenderAndWasTexturedNormally,
		...config
	}

	//
	// -- Look for colliders
	//
	const colliders:Collider[] = config?.collidersRoot ? getCollidersFrom(config.collidersRoot, mesh.skeleton, $cfg.colliderRadiusMultiplier) : []
  
    const {
        indices,
        uniqueCount,
        vPos,
        springs,
        restLengths,
        springsPointer,
        springsPerVertexArray,
		vFaces,
		vVertexToFace
    } = calculateGeometry(mesh, $cfg.colorAttributeName!);

	if( $cfg.logStats ){
		console.group("Stats") 
		console.log("vertices", uniqueCount); 
		console.log("edges", springs.length/2); 
		console.log("faces", vFaces.length/3);
		console.log("rest lengths", restLengths.length);
	

		for(let i=0; i<uniqueCount; i++){
			let hasString = false;
			for( let j=0; j<springs.length; j+=2){
				if(springs[j] === i || springs[j+1] === i){
					hasString = true;
					break;
				}
			}
			if(!hasString){
				console.log("WARNING!: vertex", i, "has no strings! wtf?");
			}
		} 

		console.groupEnd();
	}
 
	// for each vertex position, this will help us know which unique spatial vertex on the cloth this represents.
    mesh.geometry.setAttribute("uniqueIndex", new BufferAttribute(indices, 1));

	// from what face this vertex is part of.
    mesh.geometry.setAttribute("faceIndex", new BufferAttribute(vVertexToFace, 1));
		 

    const stiffnessUniform = uniform($cfg.stiffness); 
    const dampeningUniform = uniform($cfg.dampening); 
 
	/**
	 * Delta time (updated on .update)
	 */
    const dt = uniform(0);

	/**
	 * Gravity ( force acting on the cloth on every compute )
	 */
    const gravityUniform = uniform( $cfg.gravityPerSecond, "vec3");
	
	/**
	 * Wind (updated on .update)
	 */
    const windUniform = uniform( $cfg.windPerSecond, "vec3"); 

	/**
	 * position of each unique spatial index XYZ and the W is the value of the vertex paint mask ( 1:skinned, ..., 0:physics )
	 */
    const vPosStore = instancedArray(vPos, "vec4") ;

	/**
	 * The force vector acting on each unique spatial index.
	 */
    const vForceStore = instancedArray(uniqueCount, "vec3") ; 

	/**
	 * For each unique vertex, this is a pointer to the location in `vSpringsPerVertexArray` where the list of springs for that vertex begins.
	 * It starts with "count" followed by the IDs of each spring in the `springsStore` array
	 */
    const vSpringsPointer = instancedArray(springsPointer, "uint");

	/**
	 * Contains [ count, ID1, ID2, ID3, count, ID1, ID2, count, ID etc... ]
	 * Count then a serie of IDs
	 */
    const vSpringsPerVertexArray = instancedArray(
        springsPerVertexArray,
        "uint",
    );

	/**
	 * How many springs (edges) the cloth has. It will equal the number of edges of the mesh.
	 */
    const totalSprings = springs.length / 2; // because each spring has 2 vertices

	/**
	 * Total number of vertices in the mesh (not the unique vertices, the actual mesh like the one you see in Blender's stats)
	 */
    const countOfPoints = indices.length;

	/**
	 * Stores a pair of A,B ids. (id of the unique vertices that this spring will try to keep at a certain distance )
	 */
    const springsStore = instancedArray(springs, "ivec2");

	/**
	 * How strong the spring is pulling the vertices
	 */
    const springForceStore = instancedArray(totalSprings, "vec3");

	/**
	 * The target distance the spring will try to keep between the two vertices it connects.
	 */
    const restLengthsStore = instancedArray(restLengths, "float");

	/**
	 * array triplets defining a face ( a triangle )
	 */
	const vFacesStore = instancedArray(vFaces, "ivec3");
	//const vVertexToFaceStore = instancedArray(vVertexToFace, "uint");
 
	/**
	 * basically a map from each mesh's vertex to the ID of the unique spatial vertlet. ( since many vertices may exist in the space spatial position )
	 */
    const indicesStore = instancedArray(indices, "uint");
    const worldMatrix = objectWorldMatrix(mesh);

	/**
	 * This puppy is the node that runs the skinning process setting the positions of the vertices to match the skeleton.
	 */
    const skinningPosition = computeSkinning(mesh);

	/**
	 * Position XYZ and Radius W
	 */
	const collidersArray = new Float32Array((colliders?.length ?? 0) * 4);
	const colliderAttr = new StorageInstancedBufferAttribute(collidersArray, 4);
	const collidersStore = storage(colliderAttr, "vec4"); 

	const worldMatrixInverseUniform = uniform(new Matrix4());

    /** 
     * Initial setup
     */
    const initializeSkinningPosition = Fn(() => {
        If(instanceIndex.greaterThanEqual(countOfPoints), () => Return());

        const uIndex = indicesStore.element(instanceIndex);
        const wPos = vPosStore.element(uIndex); 
     
        const skinningWorldPosition = worldMatrix.mul(skinningPosition) ;
        wPos.xyz.assign(skinningWorldPosition) ; 

    })()
    .compute(countOfPoints)
    .setName("Initialize skinning points"); 

    /**
     * < SYNC TO SKINNED MESH >
     * Skinning --> unique vertices
     * Runs once per frame before physics steps.
     * Updates positions of pinned vertices to match the animation.
     */
    const updateSkinningPoints = Fn(() => {
        If(instanceIndex.greaterThanEqual(countOfPoints), () => Return());

        const uIndex = indicesStore.element(instanceIndex);
        const wPos = vPosStore.element(uIndex); 
        const factor = wPos.w.pow(2); // 1 = skinned (Pinned), 0 = cloth (Simulated)

        const skinningWorldPosition = worldMatrix.mul(skinningPosition) ;

        // Only update if factor > 0 (partially or fully skinned)
        // If fully cloth (0), we leave it to physics
        // mix(currentPos, skinningPos, factor). If factor=1, we force it to skinningPos.
	 
		wPos.xyz.assign(mix(wPos.xyz, skinningWorldPosition, factor));  

    })()
    .compute(countOfPoints)
    .setName("Update skinning points"); 


	/**
	 * < CALCULATE SPRING FORCES > 
	 * Calculates the force of each spring.
     * This iterates per SPRING (linear with number of springs).
	 */
	const computeSpringForces = Fn(()=>{

		If(instanceIndex.lessThan(totalSprings), () => {
			const vertexIds = springsStore.element( instanceIndex );
			const restLength = restLengthsStore.element( instanceIndex ) ;

			const Ai = vertexIds.x;
			const Bi = vertexIds.y; 

			const posA = vPosStore.element( Ai ).xyz; // world space
			const postB = vPosStore.element( Bi ).xyz; // world space 

			const fA = vForceStore.element(Ai);
			const fB = vForceStore.element(Bi);

			const delta = postB.sub(posA);
			const dist = delta.length().max(0.000001);
			const dir = delta.div(dist);

			const relVelocity = fB.sub(fA);
			const damping = relVelocity.dot(dir).mul(0.1);

			const force = dist.sub(restLength).mul(stiffnessUniform) .mul(dir).mul(0.5);

			springForceStore.element(instanceIndex).assign( force );  
		}); 

	})().compute( totalSprings ).setName("compute Spring Forces"); 

    /**
     * < COMPUTE VERTEX FORCES >
     * Integrates forces and updates position.
     * Iterates per VERTEX.
     */
	const computeVertexForces = Fn(()=>{

		If(instanceIndex.greaterThanEqual(uniqueCount), () => {
			Return();
		});

		const position = vPosStore.element( instanceIndex );
		const force = vForceStore.element( instanceIndex ).toVar() ; 
		const mask = (position.w).oneMinus().pow(2); // If w=1 (pinned), mask=0. If w=0 (simulated), mask=1.
 
	
		const springPointer = vSpringsPointer.element(instanceIndex);
        // springsPerVertexArray layout: [count, id1, id2, ...]
        const springCount = vSpringsPerVertexArray.element(springPointer);

        const ptrStart = springPointer.add(1).toVar("ptrStart");
        const ptrEnd = ptrStart.add(springCount).toVar("ptrEnd");

		force.mulAssign(dampeningUniform);

			Loop(
	            { start: ptrStart, end: ptrEnd, type: "uint", condition: "<" },
	            ({ i }) => {
	                const springIndex = vSpringsPerVertexArray.element(i).toVar("springId"); 
	                const spring = springsStore.element(springIndex).toVar();
	                const springForce = springForceStore.element(springIndex) ; 

					If( spring.x.equal(instanceIndex), ()=>{

						force.addAssign(springForce);
					})
					.Else(()=>{
						force.subAssign(springForce);
					})
 
					
	            },
	        );

		// // Wind
        const noise = triNoise3D(position, 1, time).sub(0.2).mul(0.1);
        const windForce = noise.mul(windUniform);
        force.addAssign(windForce);

		// Sphere collisions
		if (colliders) {
			for (let i = 0; i < colliders.length; i++) {
				const cPos = collidersStore.element(i).xyz;
                const cRad = float(collidersStore.element(i).w);
                
                // Vector from collider center to vertex
				const deltaSphere = position.add(force).sub(cPos); 
				const dist = deltaSphere.length();
                
				

                // If inside sphere (dist < radius)
				const sphereForce = cRad
					.sub(dist)
					.max(0)
					.mul(deltaSphere.normalize())
					.mul(3)
                    // Push out
				force.addAssign(sphereForce);
			}
		}

		//force.mulAssign(mask);

		force.addAssign(gravityUniform.mul(mask).mul(dt ) ); 
 
        // Zero out force if pinned (mask=0) so position doesn't drift
        // Position update: position += force * mask
	 	position.xyz.addAssign( force    );
		//position.y.addAssign(gravityUniform.mul(mask).mul(dt) );
 
		
	 
	 	//force.assign( vec3(0,0,0) );
 
		
	})().compute( uniqueCount ).setName("compute Vertex Forces"); 

	const calculateRestLengths = Fn(()=>{
		If(instanceIndex.lessThan(totalSprings), () => {
			const vertexIds = springsStore.element( instanceIndex );
			const restLength = restLengthsStore.element( instanceIndex ) ;

			const Ai = vertexIds.x;
			const Bi = vertexIds.y; 

			const posA = vPosStore.element(Ai).xyz;
			const posB = vPosStore.element(Bi).xyz;

			const delta = posB.sub(posA);
			const dist = delta.length().max(0.000001);
			restLength.assign(dist);
 

		});
	})().compute( totalSprings ).setName("calculate Rest Lengths"); 

	const discriminate = Fn(() => {

		If(instanceIndex.lessThan(totalSprings), () => {

			const vertexIds = springsStore.element( instanceIndex );
			const restLength = restLengthsStore.element( instanceIndex ) ;

			const Ai = vertexIds.x;
			const Bi = vertexIds.y; 

			const posA = vPosStore.element(Ai);
			const posB = vPosStore.element(Bi);

			If( restLength.greaterThan(0), ()=>{
				posA.y.assign(restLength);
				posB.y.assign(restLength);
			})

		});
		
	})().compute( totalSprings ).setName("discriminate");
 
    // Visualization material
    const vertexNode = Fn(() => {
            const customPosition = vPosStore.element(
                attribute("uniqueIndex", "uint"),
            );

            return cameraProjectionMatrix
                .mul(cameraViewMatrix)
                .mul(vec4(customPosition.xyz, 1.0));
        })();

	const calculateNormal = Fn(() => { 
		const uIndex = attribute("faceIndex", "uint");
		const face = vFacesStore.element(uIndex);
		const v0 = vPosStore.element(face.x).toVar();
		const v1 = vPosStore.element(face.y).toVar();
		const v2 = vPosStore.element(face.z).toVar(); 

		// Compute edges from the actual vertices
		const edge1 = v1.sub(v0);
		const edge2 = v2.sub(v0);
		
		// Cross product gives the normal
		const normal = cross(edge1, edge2).normalize();
		
		const localNormal = worldMatrixInverseUniform.transformDirection(normal);
		return transformNormalToView(localNormal);
	});

	const vNormal = calculateNormal().toVarying();
	const normalNode = select(frontFacing, vNormal, vNormal.negate());

	const updateCollidersPositions = ()=>{
		if(!colliders?.length){
			return;
		}

		const collidersArray = colliderAttr.array;

		for(let i = 0; i < colliders.length; i++){ 
			const col = colliders[i];
			if( col.position instanceof Vector3 )
			{
				v.copy(col.position)
			}
			else 
			{
				col.position.updateMatrixWorld(true);
				col.position.getWorldPosition(v);
			}

			collidersArray[i * 4] = v.x;
			collidersArray[i * 4 + 1] = v.y;
			collidersArray[i * 4 + 2] = v.z;
			collidersArray[i * 4 + 3] = col.radius  ;
		} 
		
		colliderAttr.needsUpdate = true;
	}

	mesh.material = $cfg.updateMaterial!(mesh.material as Material, vertexNode, normalNode); 
	
	worldMatrixInverseUniform.value.copy(mesh.matrixWorld).invert();

    // Initialization compute
	renderer.compute( initializeSkinningPosition );
	renderer.compute( calculateRestLengths ); 
 
    return {

		stiffnessUniform,
		dampeningUniform,
		gravityUniform,
		windUniform,

		/** 
		 * @param delta seconds passed since last render
		 * @param steps number of steps to run the simulation ( more steps = more "stable" but slower ) 
		 */
        update: (delta: number, steps=11) => {

			mesh.updateMatrixWorld();

			worldMatrixInverseUniform.value.copy(mesh.matrixWorld).invert();
            
			renderer.compute(updateSkinningPoints); 

			//
			// extract the position of the colliders and send them to the GPU
			//
			updateCollidersPositions(); 

			dt.value = delta/steps;

			for(let i=0; i<steps; i++ )
			{
				renderer.compute(computeSpringForces);
				renderer.compute(computeVertexForces);
			} 
        },
    };
}


/**
 * A SIMPLE cloth simulation. Goal is to have a minimal interface to just get some mesh to act kind of like a cloth. 
 * Adaptation/Based on the Three's Official examples: https://github.com/mrdoob/three.js/blob/a58e9ecf225b50e4a28a934442e854878bc2a959/examples/webgpu_compute_cloth.html
 * 
 */
export class SimpleCloth {
 
	/**
	 * Turns the vertex painted parts of a skinned mesh into a cloth simulation.
	 * Red paint is assumed to be the part of the mesh that should be simulated.
	 * The rest is assumed to be white. 
	 * 
 	 * @param mesh The skinned mesh to turn into a cloth simulation.
	 * @param renderer The renderer ( because we need to run compute shaders )
	 * @param options The options for the simulation.
	 * @returns The cloth simulation's API.
	 */
	static onSkinnedMesh = setupClothOnSkinnedMesh;
}
