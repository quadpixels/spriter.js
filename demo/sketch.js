goog.require('spriter');
goog.require('atlas');
goog.require('RenderCtx2D');
goog.require('RenderWebGL');

// p5js integration with spriter

class SpriterSprite {
  constructor(path, spriter_url, atlas_url) {
    this.ctx = g_ctx;
    this.spriter_data = null;
    this.atlas_data   = null;
    this.anim_time = 0;
    this.anim_length = 0;
    this.anim_length_next = 0;
    this.anim_rate = 1;
    this.anim_repeat = 2;
    this.anim_index = 0;
    this.entity_index = 0;
    this.file_index = 0;
    this.alpha = 1.0;
    this.camera_x = 0;
    this.camera_y = 0;
    this.camera_zoom = 0.5;
    this.enable_render_ctx2d = true;
    this.enable_render_debug_pose = false;
    this.anim_blend = 0;
    this.x = 240;
    this.y = 240;
    this.scale_x = 1;
    this.scale_y = 1;

    this.render_ctx2d = new RenderCtx2D(this.ctx);
    let file = {
      path: path,
      spriter_url: spriter_url,
      atlas_uri: atlas_url || "",
    };
    this.files = [ file ];
    let entity_index = 0;
    this.loading = true;
    this.loadFile(file, () => {
      console.log(this.spriter_data);
      this.loading = false;
      var entity_keys = this.spriter_data.getEntityKeys();
      var entity_key = entity_keys[entity_index = 0];
      this.spriter_pose.setEntity(entity_key);
      this.spriter_pose_next.setEntity(entity_key);
      //var entity = spriter_pose.curEntity();
      //console.log(entity.character_map_keys);
      //spriter_pose.character_map_key_array = entity.character_map_keys;
      //spriter_pose.character_map_key_array = [ 'glasses', 'blue gloves', 'black gloves', 'look ma no hands' ];
      //spriter_pose.character_map_key_array = [ 'glasses', 'blue gloves' ];
      var anim_keys = this.spriter_data.getAnimKeys(entity_key);
      var anim_key = anim_keys[this.anim_index = 0];
      this.spriter_pose.setAnim(anim_key);
      var anim_key_next = anim_keys[(this.anim_index + 1) % anim_keys.length];
      this.spriter_pose_next.setAnim(anim_key_next);
      this.spriter_pose.setTime(this.anim_time = 0);
      this.spriter_pose_next.setTime(this.anim_time);
      this.anim_length = this.spriter_pose.curAnimLength() || 1000;
      this.anim_length_next = this.spriter_pose_next.curAnimLength() || 1000;
    })
    this.prev_time = 0;
  }

  loadFile(file, callback) {
    this.render_ctx2d.dropData(
      this.spriter_data, this.atlas_data);

    this.spriter_pose      = null;
    this.spriter_pose_next = null;
    this.atlas_data        = null;

    let file_path = file.path;
    let file_spriter_url = file_path + file.spriter_url;
    let file_atlas_url   = (file.atlas_url) ? (file_path + file.atlas_url) : ("");

    this.loadText(file_spriter_url, (err, text) => {
      if (err) { callback(); return; }
      var match = file.spriter_url.match(/\.scml$/i);
      if (match) {
        var parser = new DOMParser();
        // replace &quot; with \"
        var xml_text = text.replace(/&quot;/g, "\"");
        var xml = parser.parseFromString(xml_text, 'text/xml');
        var json_text = xml2json(xml, '\t');
        // attributes marked with @, replace "@(.*)": with "\1":
        json_text = json_text.replace(/"@(.*)":/g, "\"$1\":");
        var json = JSON.parse(json_text);
        var spriter_json = json.spriter_data;
        this.spriter_data = new spriter.Data().load(spriter_json);
      } else {
        this.spriter_data = new spriter.Data().load(JSON.parse(text));
      }
      this.spriter_pose      = new spriter.Pose(this.spriter_data);
      this.spriter_pose_next = new spriter.Pose(this.spriter_data);
      this.loadText(file_atlas_url, (err, atlas_text) => {
        let images = {};
        var counter = 0;
        var counter_inc = function() {
          counter++;
        }
        var counter_dec = () => {
          if (--counter === 0) {
            this.render_ctx2d.loadData(this.spriter_data, this.atlas_data, images);
            //this.render_webgl.loadData(this.spriter_data, this.atlas_data, images);
            callback();
          }
        }
        counter_inc();
        if (!err && atlas_text) {
          this.atlas_data = new atlas.Data().importTpsText(atlas_text);

          // load atlas page images
          var dir_path = file_atlas_url.slice(0, file_atlas_url.lastIndexOf('/'));
          this.atlas_data.pages.forEach(function(page) {
            var image_key = page.name;
            var image_url = dir_path + "/" + image_key;
            counter_inc();
            images[image_key] = loadImage(image_url, ((page) => {
              return function(err, image) {
                if (err) {
                  console.log("error loading:", image && image.src || page.name);
                }
                page.w = page.w || image.width;
                page.h = page.h || image.height;
                counter_dec();
              }
            })(page));
          });
        } else {
          this.spriter_data.folder_array.forEach((folder) => {
            folder.file_array.forEach(function(file) {
              switch (file.type) {
                case 'image':
                  var image_key = file.name;
                  counter_inc();
                  images[image_key] = loadImage(file_path + file.name, (function(file) {
                    return function(err, image) {
                      if (err) {
                        console.log("error loading:", image && image.src || file.name);
                      }
                      counter_dec();
                    }
                  })(file));
                  break;
                case 'sound':
                  break;
                default:
                  console.log("TODO: load", file.type, file.name);
                  break;
              }
            });
          });
        }
        
        // with an atlas, still need to load the sound files
        this.spriter_data.folder_array.forEach((folder) => {
          folder.file_array.forEach((file) => {
            switch (file.type) {
              case 'sound':
                if (player_web.ctx) {
                  counter_inc();
                  loadSound(file_path + file.name, (function(file) {
                    return function(err, buffer) {
                      if (err) {
                        console.log("error loading sound", file.name);
                      }
                      player_web.ctx.decodeAudioData(buffer, function(buffer) {
                          player_web.sounds[file.name] = buffer;
                        },
                        function() {
                          console.log("error decoding sound", file.name);
                        });
                      counter_dec();
                    }
                  })(file));
                } else {
                  console.log("TODO: load", file.type, file.name);
                }
                break;
            }
          });
        });
        counter_dec();
      });
    })
  }

  loadText(url, callback) {
    var req = new XMLHttpRequest();
    if (url) {
      req.open("GET", url, true);
      req.responseType = 'text';
      req.addEventListener('error', function() {
        callback("error", null);
      });
      req.addEventListener('abort', function() {
        callback("abort", null);
      });
      req.addEventListener('load', function() {
          if (req.status === 200) {
            callback(null, req.response);
          } else {
            callback(req.response, null);
          }
        },
        false);
      req.send();
    } else {
      callback("error", null);
    }
    return req;
  }

  render(time, density) {
    var dt = time - (this.prev_time || time);
    this.prev_time = time; // ms

    var entity_keys;
    var entity_key;
    var anim_keys;
    var anim_key;
    var anim_key_next;

    if (!this.loading) {
      this.spriter_pose.update(dt * this.anim_rate);
      var anim_rate_next = this.anim_rate * this.anim_length_next / this.anim_length;
      this.spriter_pose_next.update(dt * anim_rate_next);

      this.anim_time += dt * this.anim_rate;

      if (this.anim_time >= (this.anim_length * this.anim_repeat)) {
        entity_keys = this.spriter_data.getEntityKeys();
        entity_key = entity_keys[this.entity_index];
        anim_keys = this.spriter_data.getAnimKeys(entity_key);
        if (++this.anim_index >= anim_keys.length) {
          this.anim_index = 0;
          if (++this.entity_index >= entity_keys.length) {
            this.entity_index = 0;
            if (this.files.length > 1) {
              if (++this.file_index >= this.files.length) {
                this.file_index = 0;
              }
              file = this.files[this.file_index];
              
              this.loading = true;
              this.loadFile(file, () => {
                this.loading = false;
                entity_keys = this.spriter_data.getEntityKeys();
                entity_key = entity_keys[this.entity_index = 0];
                this.spriter_pose.setEntity(entity_key);
                this.spriter_pose_next.setEntity(entity_key);
                anim_keys = this.spriter_data.getAnimKeys(entity_key);
                anim_key = anim_keys[this.anim_index = 0];
                this.spriter_pose.setAnim(anim_key);
                anim_key_next = anim_keys[(this.anim_index + 1) % anim_keys.length];
                this.spriter_pose_next.setAnim(anim_key_next);
                this.spriter_pose.setTime(this.nim_time = 0);
                this.spriter_pose_next.setTime(this.anim_time);
                this.anim_length = this.spriter_pose.curAnimLength() || 1000;
                this.anim_length_next = this.spriter_pose_next.curAnimLength() || 1000;
              });
              return;
            }
          }
          entity_keys = this.spriter_data.getEntityKeys();
          entity_key = entity_keys[this.entity_index];
          this.spriter_pose.setEntity(entity_key);
          this.spriter_pose_next.setEntity(entity_key);
        }
        entity_keys = this.spriter_data.getEntityKeys();
        entity_key = entity_keys[this.entity_index];
        anim_keys = this.spriter_data.getAnimKeys(entity_key);
        anim_key = anim_keys[this.anim_index];
        this.spriter_pose.setAnim(anim_key);
        anim_key_next = anim_keys[(this.anim_index + 1) % anim_keys.length];
        this.spriter_pose_next.setAnim(anim_key_next);
        this.spriter_pose.setTime(this.anim_time = 0);
        this.spriter_pose_next.setTime(this.anim_time);
        this.anim_length = this.spriter_pose.curAnimLength() || 1000;
        this.anim_length_next = this.spriter_pose_next.curAnimLength() || 1000;
      }

      entity_keys = this.spriter_data.getEntityKeys();
      entity_key = entity_keys[this.entity_index];
      anim_keys = this.spriter_data.getAnimKeys(entity_key);
      anim_key = anim_keys[this.anim_index];
      anim_key_next = anim_keys[(this.anim_index + 1) % anim_keys.length];
      //messages.innerHTML = "entity: " + entity_key + ", anim: " + anim_key + ", next anim: " + anim_key_next + "<br>" + file.path + file.spriter_url;
      if (this.spriter_pose.event_array.length > 0) {
        //messages.innerHTML += "<br>events: " + spriter_pose.event_array;
      }
      if (this.spriter_pose.sound_array.length > 0) {
        //messages.innerHTML += "<br>sounds: " + spriter_pose.sound_array;
      }
      if (this.spriter_pose.tag_array.length > 0) {
        //messages.innerHTML += "<br>tags: " + spriter_pose.tag_array;
      }
      var var_map_keys = Object.keys(this.spriter_pose.var_map);
      if (var_map_keys.length > 0) {
        //messages.innerHTML += "<br>vars: ";
        var_map_keys.forEach(function(key) {
          //messages.innerHTML += "<br>" + key + " : " + spriter_pose.var_map[key];
        });
      }
    }

    if (this.ctx) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      //ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    
    if (this.loading) {
      return;
    }

    this.spriter_pose.strike();
    this.spriter_pose_next.strike();

    this.spriter_pose.sound_array.forEach(function(sound) {
      // TODO: sound support
      // if (!player_web.mute) {
      //   if (player_web.ctx) {
      //     var source = player_web.ctx.createBufferSource();
      //     source.buffer = player_web.sounds[sound.name];
      //     var gain = player_web.ctx.createGain();
      //     gain.gain = sound.volume;
      //     var stereo_panner = player_web.ctx.createStereoPanner();
      //     stereo_panner.pan.value = sound.panning;
      //     source.connect(gain);
      //     gain.connect(stereo_panner);
      //     stereo_panner.connect(player_web.ctx.destination);
      //     source.start(0);
      //   } else {
      //     console.log("TODO: play sound", sound.name, sound.volume, sound.panning);
      //   }
      // }
    });

    let spin = 1;

    // blend next pose bone into pose bone
    this.spriter_pose.bone_array.forEach((bone, bone_index) => {
      var bone_next = this.spriter_pose_next.bone_array[bone_index];
      if (!bone_next) {
        return;
      }
      spriter.Space.tween(bone.local_space, bone_next.local_space, this.anim_blend, spin, bone.local_space);
    });

    // blend next pose object into pose object
    this.spriter_pose.object_array.forEach((object, object_index) => {
      var object_next = this.spriter_pose_next.object_array[object_index];
      if (object_next) {
        return;
      }
      switch (object.type) {
        case 'sprite':
          spriter.Space.tween(object.local_space, object_next.local_space, this.anim_blend, spin, object.local_space);
          if (this.anim_blend >= 0.5) {
            object.folder_index = object_next.folder_index;
            object.file_index = object_next.file_index;
            object.pivot.copy(object_next.pivot);
          }
          object.alpha = spriter.tween(object.alpha, object_next.alpha, this.anim_blend);
          break;
        case 'bone':
          spriter.Space.tween(object.local_space, object_next.local_space, this.anim_blend, spin, object.local_space);
          break;
        case 'box':
          spriter.Space.tween(object.local_space, object_next.local_space, this.anim_blend, spin, object.local_space);
          if (this.anim_blend >= 0.5) {
            object.pivot.copy(object_next.pivot);
          }
          break;
        case 'point':
          spriter.Space.tween(object.local_space, object_next.local_space, this.anim_blend, spin, object.local_space);
          break;
        case 'sound':
          if (this.anim_blend >= 0.5) {
            object.name = object_next.name;
          }
          object.volume = spriter.tween(object.volume, object_next.volume, this.anim_blend);
          object.panning = spriter.tween(object.panning, object_next.panning, this.anim_blend);
          break;
        case 'entity':
          spriter.Space.tween(object.local_space, object_next.local_space, this.anim_blend, spin, object.local_space);
          break;
        case 'variable':
          break;
        default:
          throw new Error(object.type);
      }
    });

    // compute bone world space
    this.spriter_pose.bone_array.forEach((bone) => {
      var parent_bone = this.spriter_pose.bone_array[bone.parent_index];
      if (parent_bone) {
        spriter.Space.combine(parent_bone.world_space, bone.local_space, bone.world_space);
      } else {
        bone.world_space.copy(bone.local_space);
      }
    });

    // compute object world space
    this.spriter_pose.object_array.forEach((object) => {
      switch (object.type) {
        case 'sprite':
          var bone = this.spriter_pose.bone_array[object.parent_index];
          if (bone) {
            spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
          } else {
            object.world_space.copy(object.local_space);
          }
          var folder = this.spriter_data.folder_array[object.folder_index];
          var file = folder && folder.file_array[object.file_index];
          if (file) {
            var offset_x = (0.5 - object.pivot.x) * file.width;
            var offset_y = (0.5 - object.pivot.y) * file.height;
            spriter.Space.translate(object.world_space, offset_x, offset_y);
          }
          break;
        case 'bone':
          var bone = this.spriter_pose.bone_array[object.parent_index];
          if (bone) {
            spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
          } else {
            object.world_space.copy(object.local_space);
          }
          break;
        case 'box':
          var bone = this.spriter_pose.bone_array[object.parent_index];
          if (bone) {
            spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
          } else {
            object.world_space.copy(object.local_space);
          }
          var entity = this.spriter_pose.curEntity();
          var box_info = entity.obj_info_map[object.name];
          if (box_info) {
            var offset_x = (0.5 - object.pivot.x) * box_info.w;
            var offset_y = (0.5 - object.pivot.y) * box_info.h;
            spriter.Space.translate(object.world_space, offset_x, offset_y);
          }
          break;
        case 'point':
          var bone = this.spriter_pose.bone_array[object.parent_index];
          if (bone) {
            spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
          } else {
            object.world_space.copy(object.local_space);
          }
          break;
        case 'sound':
          break;
        case 'entity':
          var bone = this.spriter_pose.bone_array[object.parent_index];
          if (bone) {
            spriter.Space.combine(bone.world_space, object.local_space, object.world_space);
          } else {
            object.world_space.copy(object.local_space);
          }
          break;
        case 'variable':
          break;
        default:
          throw new Error(object.type);
      }
    });

    let ctx = this.ctx;
    if (ctx) {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.scale(density, density);

      // origin at center, x right, y up
      ctx.translate(this.x, this.y);
      ctx.scale(1*this.scale_x, -1*this.scale_y);

      ctx.translate(-this.camera_x, -this.camera_y);
      ctx.scale(this.camera_zoom, this.camera_zoom);
      ctx.lineWidth = 1 / this.camera_zoom;

      if (this.enable_render_ctx2d) {
        this.render_ctx2d.drawPose(this.spriter_pose, this.atlas_data);
        //ctx.translate(0, -10);
        //render_ctx2d.drawPose(spriter_pose_next, atlas_data);
      }

      if (this.enable_render_debug_pose) {
        this.render_ctx2d.drawDebugPose(this.spriter_pose, this.atlas_data);
        //ctx.translate(0, -10);
        //render_ctx2d.drawDebugPose(spriter_pose_next, atlas_data);
      }
      ctx.restore();
    }
  }

  SetPos(x, y) {
    this.x = x; this.y = y;
  }
  
  SetScale(x, y) {
    this.scale_x = x;
    this.scale_y = y;
  }

  SetAnimRate(r) {
    this.anim_rate = r;
  }
}
