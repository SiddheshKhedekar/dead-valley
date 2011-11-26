// collidable
//
// A mixin for collision handling

define(["Vector"], function (Vector) {

  var currentCollisionList = {};
  var speculativeContactCheckList = [];

  var findAdjacentNodes = function () {
    if (!this.visible || !this.currentNode) {
      return [];
    }
    if (this.adjacentNodes) {
      return this.adjacentNodes;
    }
    var cn = this.currentNode;
    var north = cn.north;
    var south = cn.south;
    this.adjacentNodes = [cn,
                          north,
                          south,
                          cn.east,
                          cn.west,
                          north && north.east,
                          north && north.west,
                          south && south.east,
                          south && south.west];
     return this.adjacentNodes;
  };

  // what we do when we actually have a collision
  var defaultCollisionCallback = function (result) {
    var we      = result.we;
    var they    = result.they;
    var point   = result.point;
    var normal  = result.normal;
    var wePoint = result.wePoint;

    if (we.ignoreCollisionResolution || they.ignoreCollisionResolution) {
      we.touch(they, point, normal);
      they.touch(we, point, normal);
    } else {
      var vab = resolveCollision(we, they, point, normal, wePoint);
      we.collision(they, point, normal, vab);
      they.collision(we, point, normal.scale(-1), vab);
      speculativeContactCheckList.push(we);
    }
  };

  var speculativeContactRectifierCallback = function (delta) {
    return function (result) {
      var we      = result.we;
      var they    = result.they;
      var normal  = result.normal.clone().normalize();

      // get all of relative normal velocity
      var relativeNormalVelocity = (we.vel.subtract(they.vel)).dotProduct(normal);

      var dist = result.normal.magnitude() - relativeNormalVelocity * delta;

      // we want to remove only the amount which leaves them touching next frame
      var remove = relativeNormalVelocity + dist;

      if (remove < 0) {
        // compute impulse
        var wePart   = they.mass / (we.mass + they.mass);
        var theyPart = 1 - wePart;

        // apply impulse
        we.vel.translate(normal.multiply(-1 * wePart * remove));
        they.vel.translate(normal.multiply(theyPart * remove));
      }
    };
  };

  var checkCollisionsAgainst = function (canidates, callback) {
    var len = canidates.length;
    var ref, canidate, result, other, point, normal, wePoint;
    for (var i = 0; i < len; i++) {
      canidate = canidates[i];
      ref = canidate && canidate.nextSprite;
      while (ref) {
	if (ref.collidable) {
	  result = this.checkCollision(ref);

          if (result) {
            callback ? callback(result) : defaultCollisionCallback(result);
          }
	}
	ref = ref.nextSprite;
      }
    }
  };

  // TODO figure out collidable sprite pairs first
  // and eliminate duplicates before running
  // checkCollision
  var checkCollision = function (other) {
    var normals, minDepth, nl, we, they, left, right, depth,
        minPoint, normalIndex;

    if (!other.visible  ||
         this === other ||
        (this.collidesWith &&
        !this.collidesWith[other.name])) {
      return;
    }

    // check to see if the pair has already been checked for collisions
    var thisOtherID = this.id + ',' + other.id;
    if (currentCollisionList[thisOtherID]) {
      return;
    }
    // put the pair in the list for further checks
    currentCollisionList[thisOtherID] = true;
    currentCollisionList[other.id + ',' + this.id] = true;

    var weNormals   = this.transformedNormals();
    var theyNormals = other.transformedNormals();

    normals = weNormals.concat(theyNormals);

    minDepth = Number.MAX_VALUE;

    nl = normals.length;
    for (i = 0; i < nl; i++) {
      we   = this.lineProjection(normals[i]);
      they = other.lineProjection(normals[i]);
      if (we[1] < they[0] || we[0] > they[1]) {
        return; // no collision!
      } else {
        left = Math.abs(we[1] - they[0]);
        right = Math.abs(they[1] - we[0]);
        depth = Math.min(left, right);
        if (depth < minDepth) {
          minDepth = depth;
          minPoint = (right < left) ?
                       [we[2], they[3]] :
                       [we[3], they[2]];
          normalIndex = i;
        }
      }
    }
    
    // we're edge on if the min depth is on our normal, so use "they"'s point
    var pointIndex, contactPoints, points, point;
    var wePoint = normalIndex >= weNormals.length;
    if (wePoint) {
      pointIndex  = minPoint[0];
      // if it's our point, it's the other's normal
      // contactPoints = calculateContactPoints(this, pointIndex, other, normalIndex - weNormals.length);

      points = this.transformedPoints();
    } else {
      pointIndex  = minPoint[1];
      // if it's the other's point, it's our normal
      // contactPoints = calculateContactPoints(other, pointIndex, this, normalIndex);

      points = other.transformedPoints();
    }
    point = points[pointIndex];

    // some of these normals (like building's) are not
    // calculated every frame so we need to protect them by cloning it
    var normal = normals[normalIndex].clone();

    if (minDepth > 0) { // don't want a 0,0 normal
      // scale the normal to the penetration depth
      normal.scale(minDepth);
    }

    // normal should always point toward 'this'
    if (point.subtract(this.pos).dotProduct(normal) > 0) {
      normal.scale(-1);
    }

    return {
      we:      this,
      they:    other,
      point:   point,  // point the collision occured on
      normal:  normal, // normal scaled to the penetration depth
      wePoint: wePoint // does the point belong to us
    };
  };

  var lineProjection = function (normal) {
    var min, max, points, count, dot, pmin_index, pmax_index;

    min = Number.MAX_VALUE;
    max = -Number.MAX_VALUE;
    points = this.transformedPoints();
    count = points.length;
    for (var j = 0; j < count; j++) {
      dot = normal.dotProduct(points[j]);
      min = Math.min(min, dot);
      max = Math.max(max, dot);
      if (dot === min) {
        pmin_index = j;
      } 
      if (dot === max) {
        pmax_index = j;
      }
    }
    return [min, max, pmin_index, pmax_index];
  };

  //velocity of a point on body
  var pointVel = function (worldOffset) {
    return worldOffset.normal()
                  .scale(this.vel.rot * Math.PI / 180.0)
                  .translate(this.vel);
  };

  // see http://www.wildbunny.co.uk/blog/2011/06/07/how-to-make-angry-birds-part-2/
  // we is the owner of the point
  // they is the owner of the normal
  var calculateContactPoints = function (we, pointIndex, they, normalIndex) {
    var wePoints    = we.transformedPoints();
    var theyPoints  = they.transformedPoints();
    var weNormals   = we.transformedNormals();
    var theyNormals = they.transformedNormals();

    var normal = theyNormals[normalIndex];

    // go through we's normals and see which one is most opposed
    var minDot = 1;
    var weFaceIndex;
    var length = wePoints.length;
    for (var i = 0; i < length; i++) {
      var dot = weNormals[i].dotProduct(normal);
      if (dot < minDot) {
        minDot = dot;
        weFaceIndex = i;
      }
    }

    var points = {
      wePoints: [],
      theyPoints: []
    };

    var theyPoint0 = theyPoints[normalIndex];
    var theyPoint1 = theyPoints[(normalIndex + 1) % theyPoints.length];
    var wePoint0 = wePoints[weFaceIndex];
    var wePoint1 = wePoints[(weFaceIndex + 1) % wePoints.length];

    points.theyPoints.push(projectPointOntoEdge(wePoint0, theyPoint0, theyPoint1));
    points.theyPoints.push(projectPointOntoEdge(wePoint1, theyPoint0, theyPoint1));
    points.wePoints.push(projectPointOntoEdge(theyPoint0, wePoint0, wePoint1));
    points.wePoints.push(projectPointOntoEdge(theyPoint1, wePoint0, wePoint1));

    return points;
  };

  var projectPointOntoEdge = function(point, edge0, edge1) {
    // vector from edge to point
    var v = point.subtract(edge0);

    // edge vector
    var e = edge1.subtract(edge0);

    // time along edge
    var t = e.dotProduct(v) / (e.x * e.x + e.y * e.y);

    // clamp to edge bounds
    if (t < 0) {
      t = 0;
    } else if (t > 1) {
      t = 1;
    }

    // form point and return
    return edge0.add(e.scale(t));
  };
  

  // resolve the collision between two rigid body sprites
  // returns false if they're moving away from one another
  // TODO: find a better way to structure all this
  var resolveCollision = function (we, they, point, vector, wePoint) {
    we.collided   = true;
    they.collided = true;

    // rectify the positions
    var wePart   = they.mass / (we.mass + they.mass);
    var theyPart = wePart - 1;
    wePart   = vector.multiply(wePart);
    theyPart = vector.multiply(theyPart);

    we.pos.translate(wePart);
    they.pos.translate(theyPart);
    
    // rectify the point
    if (wePoint) {
      point.translate(wePart);
    } else {
      point.translate(theyPart);
    }

    var vab = we.pointVel(point.subtract(we.pos)).subtract(they.pointVel(point.subtract(they.pos)));

    // onlybdo this stuff if one of the collidiees are rigid bodies
    if (we.isRigidBody || they.isRigidBody) {

      var n = vector.clone().normalize();

      // coefficient of restitution (how bouncy the collision is)
      // TODO make configurable by individual
      var e = 0.2;

      var ap  = point.subtract(we.pos).normal();
      var bp  = point.subtract(they.pos).normal();
      var apd = Math.pow(ap.dotProduct(n), 2);
      var bpd = Math.pow(bp.dotProduct(n), 2);

      var dot = vab.dotProduct(n);
      if (dot > 0) {
        return vab; // moving away from each other, no need to resolve
      }

      var j = -(1 + e) * dot;

      j /= n.multiply(1/we.mass + 1/they.mass).dotProduct(n) +
           apd / we.inertia + bpd / they.inertia;

      we.vel.translate(n.multiply(j  / we.mass));
      they.vel.translate(n.multiply(-j  / they.mass));

      // TODO make all rot into radians
      // this used to be 180 * but I / 5 to make the collisions less jumpy
      we.vel.rot += 34 * (ap.dotProduct(n.multiply(j)) / we.inertia) / Math.PI;
      they.vel.rot += 34 * (bp.dotProduct(n.multiply(-j)) / they.inertia) / Math.PI;

    }

    return vab;
  };

  var checkRayCollision = function (start, end) {
    var points  = this.transformedPoints();

    var rayVector = end.subtract(start);

    // found this here:
    // http://stackoverflow.com/questions/563198/how-do-you-detect-where-two-line-segments-intersect
    var segmentCount = points.length;
    for (var i = 0; i < segmentCount; i++) {
      var j = (i + 1) % segmentCount; // wrap to 0 at end
      var segmentVector = points[j].subtract(points[i]);
      var segmentNormal = segmentVector.normal();
      // only hit facing edges
      if (segmentNormal.dotProduct(rayVector) > 0) {
        var first = points[i].subtract(start);
        var denom = rayVector.crossProduct(segmentVector);
        if (denom !== 0) {
          var t = first.crossProduct(segmentVector) / denom; // ray scale
          var u = first.crossProduct(rayVector)     / denom; // segment scale
          // all between 0 and 1
          if (t < 1 && t > 0 && u < 1 && u > 0) {
            return {
              point:     start.add(rayVector.scale(t)),
              normal:    segmentNormal.normalize(),
              direction: rayVector.normalize()
            };
          }
        }
      }
    }
    return false;
  };

  var checkPointCollision = function (point) {
    var minDepth = Number.MAX_VALUE;
    var normals = this.transformedNormals();

    for (var i = 0; i < normals.length; i++) {
      var normal = normals[i];
      var spriteProj = this.lineProjection(normal);
      var pointProj  = normal.dotProduct(point);

      if (pointProj < spriteProj[0] || pointProj > spriteProj[1]) {
        return false; // no collision!
      }
    }

    return true;
  };


  // make whatever object passed to us 'collidable'
  var collidable = function (thing, collidesWith) {
    thing.prototype.collidesWith = collidesWith;
    thing.prototype.collidable   = true;

    thing.prototype.findAdjacentNodes      = findAdjacentNodes;
    thing.prototype.checkCollisionsAgainst = checkCollisionsAgainst;
    thing.prototype.checkCollision         = checkCollision;
    thing.prototype.lineProjection         = lineProjection;
    thing.prototype.pointVel               = pointVel;
    thing.prototype.checkRayCollision      = checkRayCollision;
    thing.prototype.checkPointCollision    = checkPointCollision;
    
    if (!thing.prototype.touch) {
      thing.prototype.touch = function () {};
    }
  };

  collidable.clearCurrentCollisionList = function () {
    if (!_.isEmpty(currentCollisionList)) {
      currentCollisionList = {};
    }
  };

  collidable.checkSpeculativeContacts = function (delta) {
    var sprite;

    this.clearCurrentCollisionList();

    var callback = speculativeContactRectifierCallback(delta);
    var spriteCount = speculativeContactCheckList.length;
    for (i = 0; i < spriteCount; i++) {
      sprite = speculativeContactCheckList[i];
      if (sprite.collidable) {
        // use the current delta
        sprite.speculativeMove(delta, function () {
          sprite.checkCollisionsAgainst(sprite.findAdjacentNodes(), callback);
        });
      }
    }
    // clear the check list
    speculativeContactCheckList.splice(0);
  };

  return collidable;
});
