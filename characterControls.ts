import { Ray, RigidBody, World } from "@dimforge/rapier3d";
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/Addons.js";

export const CONTROLLER_BODY_RADIUS = 0.135;

export class CharacterControls {

    model: THREE.Group
    mixer
    animationsMap
    orbitControl
    camera

    //state
    toggleRun = false;
    jumping = false;
    currentAction;

    //temporary data
    walkDirection = new THREE.Vector3();
    rotateAngle = new THREE.Vector3(0,1,0)
    rotateQuaternion = new THREE.Quaternion();
    cameraTarget = new THREE.Vector3();
    storedFall = 0;

    //constants
    fadeDuration = .2;
    runVelocity = 10;
    walkVelocity = 4;
    jumpDuration = .3;

    ray: Ray
    rigidBody: RigidBody
    lerp = (x: number, y:number, a: number) => x * (1 - a) + y * a;

    constructor(model: THREE.Group, 
        mixer: THREE.AnimationMixer, animationsMap: Map<string, THREE.AnimationAction>, 
        orbitControl: OrbitControls, camera: THREE.Camera, 
        currentAction: string,
        ray: Ray, rigidBody: RigidBody) {
        this.model = model;
        this.mixer = mixer;
        this.animationsMap = animationsMap;
        this.currentAction = currentAction;
        this.animationsMap.forEach((value, key) => {
            if(key == currentAction) {
                value.play()
            }
        });
        this.ray = ray;
        this.rigidBody = rigidBody;
        this.orbitControl = orbitControl;
        this.camera = camera;
        this.updateCameraTarget(new THREE.Vector3(0,1,5));
        let translation = this.rigidBody.translation();
        this.model.position.set(translation.x, translation.y, translation.z);
    }
    switchRunToggle(){
        this.toggleRun = !this.toggleRun;
    }

    update(world: World, delta: number, keysPressed: any){
        const DIRECTIONS = ['w', 'a', 's', 'd'];
        const directionPressed = DIRECTIONS.some(key => keysPressed[key] == true);
        const jump = keysPressed[' '];
        var play = '';
        if(directionPressed && this.toggleRun){
            play = 'Run';
        } else if(directionPressed){
            play = 'Walk'
        } else {
            play = 'Idle_A'
        }
        if(this.jumping){
            play = 'Jump';
        }

        if(this.currentAction != play){
            const toPlay = this.animationsMap.get(play);
            const current = this.animationsMap.get(this.currentAction);

            current.fadeOut(this.fadeDuration);
            toPlay.reset().fadeIn(this.fadeDuration).play();

            this.currentAction = play;
        }

        this.mixer.update(delta);

        this.walkDirection.x = this.walkDirection.y = this.walkDirection.z = 0;

        let velocity = 0;
        if(this.currentAction == 'Run' || this.currentAction == 'Walk' || this.currentAction == 'Jump'){
            // calculate camera direction
            var angleYCameraDirection = Math.atan2(
                (this.model.position.x - this.camera.position.x),
                (this.model.position.z - this.camera.position.z)
            );
            // diangonal movement angle offset
            var tmp = this.directionOffset(keysPressed);
            if(tmp.valid){
                var directionOffset = tmp.directionOffset;
                
                // rotate model
                this.rotateQuaternion.setFromAxisAngle(this.rotateAngle, angleYCameraDirection + directionOffset);
                this.model.quaternion.rotateTowards(this.rotateQuaternion, 0.2);
                
                // calculate direction
                this.camera.getWorldDirection(this.walkDirection);
                this.walkDirection.y = 0;
                this.walkDirection.normalize();
                this.walkDirection.applyAxisAngle(this.rotateAngle, directionOffset);
                
                // run/walk velocity
                velocity = this.currentAction == 'Run' ? this.runVelocity : this.walkVelocity;
            }

            
        }
        const translation = this.rigidBody.translation();
        if(translation.y < -1){
            this.rigidBody.setNextKinematicTranslation({
                x: 0,
                y: 10,
                z: 0
            });
        } else {
            const cameraPositionOffset = this.camera.position.sub(this.model.position);
            // move model & camera
            this.model.position.x = translation.x;
            this.model.position.y = translation.y;
            this.model.position.z = translation.z;
            this.updateCameraTarget(cameraPositionOffset);
    
            this.walkDirection.y += this.lerp(this.storedFall, -9.81 * delta, 0.10);
            this.storedFall = this.walkDirection.y;
            this.ray.origin.x = translation.x;
            this.ray.origin.y = translation.y;
            this.ray.origin.z = translation.z;
            let hit = world.castRay(this.ray, 0.5, false);
            if(hit){
                const point = this.ray.pointAt(hit.timeOfImpact);
                let diff = translation.y - (point.y + CONTROLLER_BODY_RADIUS);
                if(diff < 0.0){
                    this.storedFall = 0;
                    this.walkDirection.y = this.lerp(0, Math.abs(diff), 0.5);
                }
            }

            let frontRay = new Ray(translation, {x: 0, y: 0, z: 1});
            
            let frontHit = world.castRay(frontRay, 0.13, false);
            if(frontHit){
                const point = frontRay.pointAt(frontHit.timeOfImpact);
                let diff = translation.z - (point.z + CONTROLLER_BODY_RADIUS);
                if(diff < 0.0){
                    this.walkDirection.z = 0;
                }
            }

    
            this.walkDirection.x = this.walkDirection.x * velocity * delta;
            this.walkDirection.z = this.walkDirection.z * velocity * delta;
    
            this.rigidBody.setNextKinematicTranslation({
                x: translation.x + this.walkDirection.x,
                y: translation.y + this.walkDirection.y,
                z: translation.z + this.walkDirection.z
            });
        }
    }

    directionOffset(keysPressed){
        var flag = true;
        var directionOffset = 0 //w

        if(keysPressed['w']){
            if(keysPressed['a']){
                directionOffset = Math.PI / 4 //w+a
            } else if (keysPressed['d']) {
                directionOffset = - Math.PI / 4; //w+d
            }
        }
        else if(keysPressed['s']){
            if(keysPressed['a']){
                directionOffset = 3 * Math.PI / 4 //s+a
            } else if (keysPressed['d']) {
                directionOffset = - 3 * Math.PI / 4; //s+d
            } else {
                directionOffset = Math.PI; //s
            }
        }
        else if(keysPressed['a']){
            directionOffset = Math.PI / 2; //a 
        } else if(keysPressed['d']){
            directionOffset = - Math.PI / 2; //d
        } else if(keysPressed[' ']){
            console.log('jump');
            flag = false;
        }

        console.log(flag);
        return {valid: flag, directionOffset: directionOffset};
    }

    updateCameraTarget(offset: THREE.Vector3){
        const rigidTranslation = this.rigidBody.translation();

        this.camera.position.x = rigidTranslation.x + offset.x;
        this.camera.position.y = rigidTranslation.y + offset.y;
        this.camera.position.z = rigidTranslation.z + offset.z;

        this.cameraTarget.x = rigidTranslation.x;
        this.cameraTarget.y = rigidTranslation.y+1;
        this.cameraTarget.z = rigidTranslation.z;
        this.orbitControl.target = this.cameraTarget;
    }

    jump(isJumping){
        this.jumping = isJumping
    }
}