Pop.Debug("Exe args x" + Pop.GetExeArguments().length, Pop.GetExeArguments() );

Pop.Include = function(Filename)
{
	let Source = Pop.LoadFileAsString(Filename);
	return Pop.CompileAndRun( Source, Filename );
}


const VertShader = Pop.LoadFileAsString('Quad.vert.glsl');
const PathTraceShader = Pop.LoadFileAsString('PathTrace.frag.glsl');

Pop.Include('PopShaderCache.js');
Pop.Include('PopEngineCommon/PopFrameCounter.js');
Pop.Include('PopEngineCommon/PopCamera.js');
Pop.Include('PopEngineCommon/PopMath.js');
Pop.Include('PopXrInputLeapMotion.js');

Pop.Include('PopEngineCommon/ParamsWindow.js');

const MAX_SPHERES = 12;
const MAX_PLANES = 2;

let Params = {};
Params.FloorY = -0.05;
Params.WallZ = -0.05;
Params.FloorMetal = false;
Params.WallMetal = false;
Params.FloorFuzz = 0.1;
Params.WallFuzz = 0.1;

let OnParamsChanged = function(Params){};
let ParamsWindow = new CreateParamsWindow(Params,OnParamsChanged);
ParamsWindow.AddParam('FloorY',-1,1);
ParamsWindow.AddParam('WallZ',-1,1);
ParamsWindow.AddParam('FloorMetal');
ParamsWindow.AddParam('WallMetal');
ParamsWindow.AddParam('FloorFuzz',0,1);
ParamsWindow.AddParam('WallFuzz',0,1);

function PadArray(Array,Size)
{
	for ( let i=Array.length;	i<Size;	i++ )
		Array[i] = 0;
}

function UnrollArray16s(Arrays,MaxLength)
{
	let Elements = [];
	let Append = function(SubArray)
	{
		//Pop.Debug("SubArray", typeof SubArray, SubArray.length);
		PadArray( SubArray, 16 );
		Elements = Elements.concat( SubArray );
	}
	//Pop.Debug("Arrays", Array.isArray(Arrays) );
	Arrays.forEach( Append );
	//Pop.Debug("Elements",Elements.length, Elements);
	Elements.length = Math.min( MaxLength, Elements.length );
	return Elements;
}

let Camera = new Pop.Camera();
Camera.Position = [ 0, 0.09, 0.3 ];
Camera.LookAt = [ 0,0,0 ];
Camera.Aperture = 0.1;
Camera.LowerLeftCorner = [0,0,0];
Camera.DistToFocus = 0.2;
Camera.Horizontal = [0,0,0];
Camera.Vertical = [0,0,0];
Camera.LensRadius = 1;
Camera.Aperture = 0.00015;


function vec3_length(v)
{
	return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
}

function vec3_squared_length(v)
{
	return v[0]*v[0] + v[1]*v[1] + v[2]*v[2];
}

function vec3_multiply(v1,n)
{
	let x = v1[0] * n;
	let y = v1[1] * n;
	let z = v1[2] * n;
	return [x,y,z];
}

function vec3_multiply_float(v1,n)
{
	let x = v1[0] * n;
	let y = v1[1] * n;
	let z = v1[2] * n;
	return [x,y,z];
}

function vec3_multiply_vec(v1,v2)
{
	let x = v1[0] * v2[0];
	let y = v1[1] * v2[1];
	let z = v1[2] * v2[2];
	return [x,y,z];
}

function vec3_divide(v1,n)
{
	let x = v1[0] / n;
	let y = v1[1] / n;
	let z = v1[2] / n;
	return [x,y,z];
}

function vec3_divide_float(v1,n)
{
	let x = v1[0] / n;
	let y = v1[1] / n;
	let z = v1[2] / n;
	return [x,y,z];
}

function vec3_add_vec(v1,v2)
{
	let x = v1[0] + v2[0];
	let y = v1[1] + v2[1];
	let z = v1[2] + v2[2];
	return [x,y,z];
}

function vec3_subtract_vec(v1, v2)
{
	let x = v1[0] - v2[0];
	let y = v1[1] - v2[1];
	let z = v1[2] - v2[2];
	return [x,y,z];
}

function vec3_subtract_float(v1,n)
{
	let x = v1[0] - n;
	let y = v1[1] - n;
	let z = v1[2] - n;
	return [x,y,z];
}

function unit_vector(v1)
{
	let v_ = vec3_divide_float(v1, vec3_length(v1));
	return v_;
}

function vec3_dot(v1,v2)
{
	return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

function vec3_cross(v1,v2)
{
	let x = v1[1] * v2[2] - v1[2] * v2[1];
	let y = - (v1[0] * v2[2] - v1[2] * v2[0]);
	let z = v1[0] * v2[1] - v1[1] * v2[0];
	return [x,y,z];
}

function camera_pos(cam,vup,vfov,aspect,focus_dist)
{
	const M_PI = 3.1415926535897932384626433832795;

	let aperture = cam.Aperture;
	
	cam.LensRadius = aperture / 2.0;
	let theta = vfov * M_PI / 180.0;
	let half_height = Math.tan (theta / 2.0);
	let half_width = aspect * half_height;
	cam.w = unit_vector( vec3_subtract_vec( cam.Position, cam.LookAt ) );
	cam.u = unit_vector( vec3_cross( vup, cam.w ) );
	cam.v = vec3_cross( cam.w, cam.u );
	cam.LowerLeftCorner =
	vec3_subtract_vec(
					  vec3_subtract_vec(
										vec3_subtract_vec( cam.Position,
														  vec3_multiply_float( cam.u, half_width * focus_dist )),
										vec3_multiply_float( cam.v, half_height * focus_dist )),
					  vec3_multiply_float( cam.w, focus_dist ));
	cam.Horizontal  = vec3_multiply_float( cam.u,  2 * half_width * focus_dist );
	cam.Vertical  = vec3_multiply_float( cam.v, 2 * half_height * focus_dist );
}

function UpdateCamera(RenderTarget)
{
	let Rect = RenderTarget.GetScreenRect();
	RenderTarget.GetWidth = function(){	return Rect[2]; };
	RenderTarget.GetHeight = function(){	return Rect[3]; };
	
	Camera.DistToFocus = vec3_length( vec3_subtract_vec( Camera.Position, Camera.LookAt ) );
	
	let Up = [0,1,0];
	let VerticalFieldOfView = 45;
	let Aspect = RenderTarget.GetWidth() / RenderTarget.GetHeight();
	
	camera_pos( Camera, Up, VerticalFieldOfView, Aspect, Camera.DistToFocus );
}


function TPhysicsBody()
{
	//	turn this into a list of verlets
	//	and a seperate center of mass
	this.Position = [0,0,0];
	this.Velocity = [0.1,0,0];
	this.Drag = 0.9;
	
	//	this!=undefined makes it a sphere
	this.SphereRadius = 1;
	
	this.GetSphere = function()
	{
		return this.Position.concat( [this.SphereRadius] );
	}
}

function TActor_Box()
{
	this.PhysicsBody = new TPhysicsBody();
	this.PhysicsBody.SphereRadius = 0.05;
	
	//	move to physics as a joint
	this.GrabPoint = null;
	
	this.GetPosition = function()			{	return this.PhysicsBody.Position.slice();	}
	this.SetPosition = function(Position)	{	this.PhysicsBody.Position = Position.slice(0,3);	}
	this.GetSphere = function()				{	return this.PhysicsBody.GetSphere();	}

	this.GetRenderSphere = function()
	{
		let Glass = 0;
		let Sphere = this.GetSphere();
		let Colour = this.GrabPoint ? [0,0.8,1] : [1,1,1];
		Sphere = Sphere.concat( Colour );
		Sphere.push(Glass);
		return Sphere;
	}
}



let LeapLeft = new Pop.Xr.InputLeapMotion("Left");
let LeapRight = new Pop.Xr.InputLeapMotion("Right");
const LeapControllerButtonRadius = 0.01;
let Box = new TActor_Box();

function GetPhysicsBodys()
{
	let Bodys = [];
	Bodys.push( Box.PhysicsBody );
	return Bodys;
}

function GetRenderSpheres()
{
	let RenderSpheres = [];
	let AppendController = function(XrState,Radius,Colour)
	{
		let ClickColours =
		[
		 [1,0,1],
		 [1,0,0],
		 [1,1,0],
		 [0,1,0],
		 ];
		let AppendButton = function(xyz,ButtonIndex)
		{
			if ( !xyz )
				return;
			let Pressed = XrState.ButtonState[ButtonIndex];
			let SphereColour = Colour;
			if ( Pressed === true )
				SphereColour = ClickColours[ButtonIndex];
			
			let xyzrcolour = [];
			xyzrcolour = xyzrcolour.concat( xyz );
			xyzrcolour.push( Radius );
			xyzrcolour = xyzrcolour.concat( SphereColour );
			RenderSpheres.push( xyzrcolour );
		}
		XrState.ButtonPositions.forEach( AppendButton );
	}
	
	RenderSpheres.push( Box.GetRenderSphere() );
	
	let LeftState = LeapLeft.GetControllerState();
	let RightState = LeapRight.GetControllerState();
	let Glass = 0;
	let OffColour = [0.8,0.8,0.8,Glass];
	AppendController( LeftState, LeapControllerButtonRadius, OffColour );
	AppendController( RightState, LeapControllerButtonRadius, OffColour);
	
	return RenderSpheres;
}

function GetRenderPlanes()
{
	let RenderPlanes = [];
	
	RenderPlanes.push( [0,1,0,Params.FloorY,	0.2,0.6,0.2,Params.FloorMetal,	Params.FloorFuzz ] );
	RenderPlanes.push( [0,0,1,Params.WallZ,		0.2,0.2,0.6,Params.WallMetal,	Params.WallFuzz ] );
	
	return RenderPlanes;
}


function Render(RenderTarget)
{
	UpdateCamera(RenderTarget);
	
	const Viewport = RenderTarget.GetScreenRect();
	const CameraProjectionMatrix = Camera.GetProjectionMatrix(Viewport);
	
	let RandomSeed = 0;
	let Shader = Pop.GetShader( RenderTarget, PathTraceShader );
	let Time = (Pop.GetTimeNowMs() % 1000) / 1000;
	
	let RenderSpheres = GetRenderSpheres();
	RenderSpheres = UnrollArray16s(RenderSpheres,16*MAX_SPHERES);
	let RenderPlanes = GetRenderPlanes();
	RenderPlanes = UnrollArray16s(RenderPlanes,16*MAX_PLANES);

	let SetUniforms = function(Shader)
	{
		Shader.SetUniform('camera_lower_left_corner', Camera.LowerLeftCorner );
		Shader.SetUniform('camera_horizontal', Camera.Horizontal );
		Shader.SetUniform('camera_vertical', Camera.Vertical );
		Shader.SetUniform('camera_lens_radius', Camera.LensRadius );
		Shader.SetUniform('ViewportPx', Viewport );
		Shader.SetUniform('random_seed', RandomSeed );
		Shader.SetUniform('Time', Time);
		Shader.SetUniform('Spheres',RenderSpheres);
		Shader.SetUniform('Planes',RenderPlanes);
		//Shader.SetUniform('CameraProjectionMatrix',CameraProjectionMatrix);
		Shader.SetUniform('CameraWorldPos',Camera.Position);
	};
	RenderTarget.DrawQuad( Shader, SetUniforms );
}

let Window = new Pop.Opengl.Window("Pop.Shiny");
Window.OnRender = Render;

Window.OnMouseDown = function(x,y,Button)
{
	if ( Button == 0 )
		Camera.OnCameraPan( x, y, true );
	if ( Button == 1 )
		Camera.OnCameraZoom( x, y, true );
}

Window.OnMouseMove = function(x,y,Button)
{
	if ( Button == 0 )
		Camera.OnCameraPan( x, y, false );
	if ( Button == 1 )
		Camera.OnCameraZoom( x, y, false );
};



function Physics_UpdateCollisions(Timestep)
{
	let Bodys = GetPhysicsBodys();
	
	let UpdateCollision = function(BodyA,BodyB)
	{
		
	}
	
	for ( let a=0;	a<Bodys.length;	a++ )
		for ( let b=a+1;	b<Bodys.length;	b++ )
			UpdateCollision(BodyA,BodyB);
}

function Physics_UpdatePositions(Timestep)
{
	let Bodys = GetPhysicsBodys();
	
	let UpdateBody = function(Body)
	{
		//	this drag is too small!
		//	need to do more like vel -= (drag*vel)*Step
		let Drag = Math.Multiply3( [Body.Drag,Body.Drag,Body.Drag], [Timestep,Timestep,Timestep] );
		let Vel = Math.Multiply3( Body.Velocity, [Timestep,Timestep,Timestep] );
		let Pos = Math.Add3( Body.Position, Vel );

		Drag[0] = 1-Drag[0];
		Drag[1] = 1-Drag[1];
		Drag[2] = 1-Drag[2];
		Body.Velocity = Math.Multiply3( Body.Velocity, Drag );
		//Pop.Debug(Body.Velocity);
		Body.Position = Pos;
	}
	Bodys.forEach( UpdateBody );
}

function UpdatePhysics(Timestep)
{
	Physics_UpdateCollisions( Timestep );
	Physics_UpdatePositions( Timestep );
	
	
	//	see if any clicking fingers intersect with the box
	//	then drag
	let Grabbed = false;
	
	let TestBoxVsController = function(Box,Controller)
	{
		let TestBoxVsButton = function(ButtonXyz,ButtonIndex)
		{
			let Pressed = Controller.ButtonState[ButtonIndex];
			if ( !Pressed )
				return;
			
			let Sphere = ButtonXyz.slice();
			Sphere.push(LeapControllerButtonRadius);
			let BoxSphere = Box.GetSphere();
			
			//	gr: allow intersection if we were previously grabbing!
			let Intersection = Math.GetSphereSphereIntersection( Sphere, BoxSphere );
			if ( !Intersection )
				return;
			
			//	get intersection in local space
			let BoxIntersectionPoint = Math.Subtract3( BoxSphere, Intersection );

			if ( !Box.GrabPoint )
			{
				//	new grab
				Box.GrabPoint = BoxIntersectionPoint;
			}
			else
			{
				//	update pos based on old point
				let Diff = Math.Subtract3( Box.GrabPoint, BoxIntersectionPoint );
				let NewPos = Math.Add3( BoxSphere, Diff );
				Box.SetPosition( NewPos );
			}
			Grabbed = true;
		}
		Controller.ButtonPositions.forEach( TestBoxVsButton );
	}
	TestBoxVsController( Box, LeapLeft.GetControllerState() );
	TestBoxVsController( Box, LeapRight.GetControllerState() );
	
	if ( !Grabbed )
		Box.GrabPoint = null;
}

async function UpdateLoop()
{
	let UpdateCounter = new Pop.FrameCounter("Update");
	while ( true )
	{
		let UpdateFps = 60;
		let UpdateMs = 1000/UpdateFps;
		await Pop.Yield(UpdateMs);
		let UpdateStep = UpdateMs/1000;	//	gr: here we could do proper time-elapsed amount
		UpdatePhysics( UpdateStep );
		UpdateCounter.Add();
	}
}
UpdateLoop().then(Pop.Debug).catch(Pop.Debug);
