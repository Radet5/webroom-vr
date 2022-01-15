import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class PhysicalObjectsManager {
  #phys_objs;
  #world;
  constructor (world) {
    this.#world = world;
    this.#phys_objs = {meshes: new THREE.Group(), bodies: {}};
  }

  getPhysObjects() {
    return this.#phys_objs;
  }

  getPhysObjectsMeshes() {
    return this.#phys_objs.meshes;
  }

  setObjectVelocity(name, velocity) {
    this.#phys_objs.bodies[name].velocity.set(velocity.x, velocity.y, velocity.z);
  }

  setObjectAngularVelocity(name, angular_velocity) {
    this.#phys_objs.bodies[name].angularVelocity.set(angular_velocity.x, angular_velocity.y, angular_velocity.z);
  }

  setObjectWorldPosition(name, position) {
    this.#phys_objs.bodies[name].position.set(position.x, position.y, position.z);
  }

  setObjectWorldQuaternion(name, quaternion) {
    this.#phys_objs.bodies[name].quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }

  reAttachObjectMesh(meshObject) {
    this.#phys_objs.meshes.attach( meshObject );
  }

  addBox(name, world_pos) {
    const boxgeometry = new THREE.BoxGeometry();
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const boxMesh = new THREE.Mesh(boxgeometry, boxMaterial);
    boxMesh.scale.set(0.1, 0.1, 0.1);
    const size = 0.05;
    const halfExtents = new CANNON.Vec3(size, size, size)
    const boxShape = new CANNON.Box(halfExtents)
    const boxBody = new CANNON.Body({ mass: 1, shape: boxShape })
    this.#addPhysObject(boxBody, boxMesh, name, world_pos);
  }

  addSphere(name, world_pos) {
    const sphereBody = new CANNON.Body({
      mass: 5, // kg
      shape: new CANNON.Sphere(0.1),
    })
    const geo = new THREE.SphereGeometry(0.1)
    const mat= new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphereMesh = new THREE.Mesh(geo, mat)
    this.#addPhysObject(sphereBody, sphereMesh, name, world_pos);
  }

  update () {
    //sync object mesh position with physics bodies
    const phys_obj_bodies = this.#phys_objs.bodies;
    this.#phys_objs.meshes.children.forEach(function(mesh) {
      const body = phys_obj_bodies[mesh.userData.name]
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    });
  }

  #addPhysObject(body, mesh, name, position) {
    this.#phys_objs.bodies[name] = body;
    body.position.set(...position); // m
    this.#world.addBody(body);
    mesh.userData.name = name;
    mesh.position.set(...position); // m
    this.#phys_objs.meshes.add(mesh);
  }

}