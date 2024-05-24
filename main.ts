import * as THREE from 'three';
import { GLTFLoader, OrbitControls } from 'three/examples/jsm/Addons.js';
import { CONTROLLER_BODY_RADIUS, CharacterControls } from './characterControls.js';
import { Collider, RigidBody, World } from '@dimforge/rapier3d';

//SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8def0);

//CAMERA
const camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.set(-13, -5, 10);

//LIGHTS
const dLight = new THREE.DirectionalLight('white', 0.6);
dLight.position.x = 20;
dLight.position.y = 30;
dLight.castShadow = true;
dLight.shadow.mapSize.width = 4096;
dLight.shadow.mapSize.height = 4096;
const d = 35;
dLight.shadow.camera.left = - d;
dLight.shadow.camera.right = d;
dLight.shadow.camera.top = d;
dLight.shadow.camera.bottom = - d;
scene.add(dLight);

const aLight = new THREE.AmbientLight('white', 0.4);
scene.add(aLight);

//RENDERER
const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
const controls = new OrbitControls( camera, renderer.domElement );
controls.minPolarAngle = Math.PI/45;
controls.maxPolarAngle = Math.PI/2;

// ANIMATE
document.body.appendChild(renderer.domElement);

// RESIZE HANDLER
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);

const loader = new GLTFLoader();

function loadTexture(path: string): THREE.Texture {
    const texture = new THREE.TextureLoader().load(path);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.x = 20;
    texture.repeat.y = 20;
    return texture;
}

var characterControls: CharacterControls;

import('@dimforge/rapier3d').then(RAPIER => {

    function body(
        scene: THREE.Scene, world: World, 
        bodyType: 'dynamic' | 'static' | 'kinematicPositionBased', 
        colliderType: 'cube' | 'sphere' | 'cylinder' | 'cone', dimension: any,
        translation: { x:number, y:number, z:number },
        rotation: { x:number, y:number, z:number }, color: string
    ): {rigid: RigidBody, mesh: THREE.Mesh} {

        let bodyDesc;

        if(bodyType == 'dynamic'){
            bodyDesc = RAPIER.RigidBodyDesc.dynamic();
        }
        else if(bodyType == 'static'){
            bodyDesc = RAPIER.RigidBodyDesc.fixed();
            bodyDesc.setCanSleep(false);
        } 
        else if(bodyType == 'kinematicPositionBased'){
            bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
        }

        if(translation){
            bodyDesc.setTranslation(translation.x, translation.y, translation.z);
        }
        if(rotation){
            const q = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ')
            )
            bodyDesc.setRotation({ x: q.x, y: q.y, z: q.z, w:q.w });
        }

        let rigidBody = world.createRigidBody(bodyDesc);

        let collider;
        if(colliderType == 'cube'){
            collider = RAPIER.ColliderDesc.cuboid(dimension.hx, dimension.hy, dimension.hz);
        }
        else if(colliderType == 'sphere'){
            collider = RAPIER.ColliderDesc.ball(dimension.radius);
        }
        else if(colliderType == 'cone'){
            collider = RAPIER.ColliderDesc.cone(dimension.hh, dimension.radius);
            collider.centerOfMass = {x:0, y:0, z:0}
        }
        else if(colliderType == 'cylinder'){
            collider = RAPIER.ColliderDesc.cylinder(dimension.hh, dimension.radius);
        }
        world.createCollider(collider, rigidBody);

        let bufferGeometry;
        if (colliderType === 'cube') {
            bufferGeometry = new THREE.BoxGeometry(dimension.hx * 2, dimension.hy * 2, dimension.hz * 2);
        } else if (colliderType === 'sphere') {
            bufferGeometry = new THREE.SphereGeometry(dimension.radius, 32, 32);
        } else if (colliderType === 'cylinder') {
            bufferGeometry = new THREE.CylinderGeometry(dimension.radius, 
                dimension.radius, dimension.hh * 2,  32, 32);
        } else if (colliderType === 'cone') {
            bufferGeometry = new THREE.ConeGeometry(dimension.radius, dimension.hh * 2,  
                32, 32);
        }

        const threeMesh = new THREE.Mesh(bufferGeometry, new THREE.MeshPhongMaterial({color: color}));
        threeMesh.castShadow = true;
        threeMesh.receiveShadow = true;
        scene.add(threeMesh);
  
        return { rigid: rigidBody, mesh: threeMesh };
    }

    function generateTerrain(nSubDivs: number, scale: {x: number, y: number, z: number }) {
        let heights: number[] = [];

        //three plane
        const threeFloor = new THREE.Mesh(
            new THREE.PlaneGeometry(scale.x, scale.z, nSubDivs, nSubDivs),
            new THREE.MeshStandardMaterial({color: 0x5B9A4C})
        )
        threeFloor.rotateX( -Math.PI / 2 );
        threeFloor.receiveShadow = true;
        threeFloor.castShadow = true;
        scene.add(threeFloor);

        const vertices = threeFloor.geometry.attributes.position.array;
        const dx = scale.x / nSubDivs;
        const dy = scale.z / nSubDivs;
        const columnRows = new Map();
        for(let i = 0; i<vertices.length; i+=3){
            let row = Math.floor(Math.abs((vertices as any)[i] + (scale.x / 2)) / dx);
            let column = Math.floor(Math.abs((vertices as any)[i+1] + (scale.z / 2)) / dy);

            const randomHeight = Math.random();
            (vertices as any)[i+2] = scale.y * randomHeight;

            if(!columnRows.get(column)){
                columnRows.set(column, new Map());
            }
            columnRows.get(column).set(row, randomHeight);
        }
        threeFloor.geometry.computeVertexNormals();

        for (let i = 0; i <= nSubDivs; ++i) {
            for (let j = 0; j <= nSubDivs; ++j) {
                heights.push(columnRows.get(j).get(i));
            }
        }

        let groundBodyDesc = RAPIER.RigidBodyDesc.fixed();
        let groundBody = world.createRigidBody(groundBodyDesc);
        let groundCollider = RAPIER.ColliderDesc.heightfield(
            nSubDivs, nSubDivs, new Float32Array(heights), scale
        );
        world.createCollider(groundCollider, groundBody);
    }

    function generateFlatTerrain(scale: {x: number, y: number, z: number}){
        //three plane
        const threeFloor = new THREE.Mesh(
            new THREE.BoxGeometry(scale.x, scale.z, scale.y),
            new THREE.MeshStandardMaterial({
                map: loadTexture('./textures/grass.jpg'),
                side: 2
            })
        )
        threeFloor.rotateX( -Math.PI / 2 );
        threeFloor.position.set(0, scale.y / 2, 0 )
        console.log(threeFloor.geometry.scale);
        
        threeFloor.receiveShadow = true;
        threeFloor.castShadow = true;
        scene.add(threeFloor);

        let groundBodyDesc = RAPIER.RigidBodyDesc.fixed();
        let groundBody = world.createRigidBody(groundBodyDesc);
        let groundCollider = RAPIER.ColliderDesc.cuboid(scale.x/2, scale.y, scale.z/2);
        world.createCollider(groundCollider, groundBody);
    }

    let gravity = {x: 0.0, y: -9.81, z: 0.0}
    let world = new RAPIER.World(gravity);

    const bodys: {rigid: RigidBody, mesh: THREE.Mesh}[] = [];

    let nSubDivs = 20;
    let scale = new RAPIER.Vector3(68.0, 3.0, 105.0);
    generateFlatTerrain(scale);

    const cubeBody = body(scene, world, 'dynamic', 'cube',
        { hx: 0.5, hy: 0.5, hz: 0.5 }, { x: 0, y: 15, z: 0 },
        { x: 0, y: 0.4, z: 0.7 }, 'orange');
    bodys.push(cubeBody);

    const sphereBody = body(scene, world, 'dynamic', 'sphere',
        { radius: 0.7 }, { x: 4, y: 15, z: 2 },
        { x: 0, y: 1, z: 0 }, 'blue');
    bodys.push(sphereBody);

    const sphereBody2 = body(scene, world, 'dynamic', 'sphere',
        { radius: 0.7 }, { x: 0, y: 15, z: 0 },
        { x: 0, y: 1, z: 0 }, 'red');
    bodys.push(sphereBody2);

    const cylinderBody = body(scene, world, 'dynamic', 'cylinder',
        { hh: 1.0, radius: 0.7 }, { x: -7, y: 15, z: 8 },
        { x: 0, y: 1, z: 0 }, 'green');
    bodys.push(cylinderBody);

    const coneBody = body(scene, world, 'dynamic', 'cone',
        { hh: 1.0, radius: 1 }, { x: 7, y: 15, z: -8 },
        { x: 0, y: 1, z: 0 }, 'purple');
    bodys.push(coneBody);

    const porta_A = body(scene, world, 'static', 'cube', 
        {hx: 3.65, hy: 1.22, hz: 0.5}, {x: 0, y:4.22, z:52},
        {x: 0, y: 0, z:0}, 'white');
    bodys.push(porta_A);
    
    //CHARACTER CONTROLS
    loader.load('models/sparrow/scene.gltf', function(gltf){
        const model = gltf.scene;
        model.traverse(function(object: any) {
            if (object.isMesh) object.castShadow = true;
        })
        scene.add(model);
        
        const gltfAnimations = gltf.animations;
        const mixer = new THREE.AnimationMixer(model);
        const animationsMap = new Map();
        gltfAnimations.filter(a => a.name != 'TPose').forEach(a => {
            console.log(a.name);
            animationsMap.set(a.name, mixer.clipAction(a))
        })

        //RIGID BODY
        let bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-1, 10, -1);
        let rigidBody = world.createRigidBody(bodyDesc);
        let dynamicCollider = RAPIER.ColliderDesc.ball(CONTROLLER_BODY_RADIUS);
        world.createCollider(dynamicCollider, rigidBody);
        
        characterControls = new CharacterControls(model, mixer, 
            animationsMap, controls, 
            camera, 'Walk',
            new RAPIER.Ray(
                { x: 0, y: 0, z: 0 },
                { x: 0, y: -1, z: 0} 
            ), rigidBody)
        
    }, undefined, function(error){
        console.log(error);
    })

    const clock = new THREE.Clock();
    let gameLoop = () => {

        let deltaTime = clock.getDelta();

        if(characterControls){
            characterControls.update(world, deltaTime, keysPressed);
        }
        
        world.step();
        
        bodys.forEach(body => {
            let position = body.rigid.translation();
            let rotation = body.rigid.rotation();
            
            body.mesh.position.x = position.x;
            body.mesh.position.y = position.y;
            body.mesh.position.z = position.z;
            
            body.mesh.setRotationFromQuaternion(new THREE.Quaternion(
                rotation.x,
                rotation.y,
                rotation.z,
                rotation.w
            ));
        });
        
        controls.update();
        renderer.render(scene, camera);

        setTimeout(gameLoop, 16);
    }

    gameLoop();
});

//CONTROL KEYS
const keysPressed = {}
document.addEventListener('keydown', (event) => {
    if(event.shiftKey && characterControls){
        characterControls.switchRunToggle()
    } 
    else if(event.key == ' ' && characterControls) {
        characterControls.jump(true);
    }
    else {
        keysPressed[event.key.toLowerCase()] = true
    }
}, false);
document.addEventListener('keyup', (event) => {
    keysPressed[event.key.toLowerCase()] = false;
    if(event.key == ' '){
        characterControls.jump(false);
    }
}, false);
