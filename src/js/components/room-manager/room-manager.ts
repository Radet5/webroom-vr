import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRUser } from '../user/vr-user';

export class RoomManager {
  #camera;
  #scene;
  #renderer;

  #wasPresenting;
  #user
  #phys_objs;

  #lastCallTime;
  #timeStep;
  #world;

  #container;
  constructor(container, windowInnerWidth, windowInnerHeight) {
    this.#container = container;
    this.#lastCallTime = 0;
    this.#timeStep = 1/60;
    this.#world = new CANNON.World(
      {gravity: new CANNON.Vec3(0, -9.82, 0)}
    );

    this.#scene = new THREE.Scene();
    this.#camera = new THREE.PerspectiveCamera(75, windowInnerWidth / windowInnerHeight, 0.1, 10);

    this.#renderer = new THREE.WebGLRenderer( { antialias: true } );
    this.#renderer.setSize(window.innerWidth, window.innerHeight);
    this.#renderer.outputEncoding = THREE.sRGBEncoding;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.xr.enabled = true;
    this.#renderer.setPixelRatio( window.devicePixelRatio );
  }

  getRenderer() {
    return this.#renderer;
  }

  #addPhysObject(body, mesh, name, position) {
    this.#phys_objs.bodies[name] = body;
    body.position.set(...position); // m
    this.#world.addBody(body);
    mesh.userData.name = name;
    mesh.position.set(...position); // m
    this.#scene.add(mesh);
    this.#phys_objs.meshes.add(mesh);
  }

  init() {
    const scene = this.#scene;

    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
    })
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0) // make it face up
    groundBody.position.set(0,-1.325,0);
    this.#world.addBody(groundBody)

    this.#phys_objs = {meshes: new THREE.Group(), bodies: {}};
    scene.add( this.#phys_objs.meshes );

    const boxgeometry = new THREE.BoxGeometry();
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const boxMesh = new THREE.Mesh(boxgeometry, boxMaterial);
    boxMesh.scale.set(0.1, 0.1, 0.1);
    const size = 0.05;
    const halfExtents = new CANNON.Vec3(size, size, size)
    const boxShape = new CANNON.Box(halfExtents)
    const boxBody = new CANNON.Body({ mass: 1, shape: boxShape })
    this.#addPhysObject(boxBody, boxMesh, "box", [-1,0,1]);

    const sphereBody = new CANNON.Body({
      mass: 5, // kg
      shape: new CANNON.Sphere(0.1),
    })
    const geo = new THREE.SphereGeometry(0.1)
    const mat= new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphereMesh = new THREE.Mesh(geo, mat)
    this.#addPhysObject(sphereBody, sphereMesh, 'sphere', [0,1,1.2]);

    this.#user = new VRUser({renderer: this.#renderer, camera: this.#camera, container: this.#container, phys_objs: this.#phys_objs});
    scene.add(this.#user.getDolly());

    this.#wasPresenting = this.#renderer.xr.isPresenting;
    const loader = new GLTFLoader();

    loader.load( 'cliffRoom_03.gltf', function ( gltf ) {
      const model = gltf.scene
      model.scale.set(0.01, 0.01, 0.01);
      model.rotateY(30);
    	scene.add( model );
    }, undefined, function ( error ) {
    	console.error( error );
    } );

    const light = new THREE.PointLight( 0xffffff, 1, 100 );
    light.position.set( 1, 1, 1 );
    scene.add( light );
  }

  onWindowResize() {
    this.#camera.aspect = window.innerWidth / window.innerHeight;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize( window.innerWidth, window.innerHeight );

  }


  #update() {
    const time = performance.now() / 1000 // seconds
    let dt = 0;
    dt = time - this.#lastCallTime
    this.#world.step(this.#timeStep, dt)
    this.#lastCallTime = time
    this.#user.update(dt);

    if (this.#renderer.xr.isPresenting && !this.#wasPresenting) {
      this.#user.setPosition(0,-1,3);
      this.#wasPresenting = true;
    }

    this.#renderer.render( this.#scene, this.#camera );
  }

  animate() {
    this.#lastCallTime = performance.now() / 1000;
    this.#renderer.setAnimationLoop( () => {
      this.#update();
    } );
  }
}