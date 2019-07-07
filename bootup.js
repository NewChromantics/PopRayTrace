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
Pop.Include('PopXrInputLeapMotion.js');

const MAX_SPHERES = 19;

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

let LeapLeft = new Pop.Xr.InputLeapMotion("Left");
let LeapRight = new Pop.Xr.InputLeapMotion("Right");


function GetRenderSpheres()
{
	let RenderSpheres = [];
	let AppendController = function(XrState,Radius,Colour)
	{
		let AppendButton = function(xyz)
		{
			if ( !xyz )
				return;
			let xyzrcolour = [];
			xyzrcolour = xyzrcolour.concat( xyz );
			xyzrcolour.push( Radius );
			xyzrcolour = xyzrcolour.concat( Colour );
			RenderSpheres.push( xyzrcolour );
		}
		XrState.ButtonPositions.forEach( AppendButton );
	}
	
	let LeftState = LeapLeft.GetControllerState();
	let RightState = LeapRight.GetControllerState();
	let Radius = 0.01;
	AppendController( LeftState, Radius, [0,1,0] );
	AppendController( RightState, Radius, [1,1,1] );
	
	return RenderSpheres;
}


function Render(RenderTarget)
{
	UpdateCamera(RenderTarget);
	
	const Viewport = RenderTarget.GetScreenRect();
	//const CameraProjectionMatrix = Camera.GetProjectionMatrix(Viewport);
	
	let WindowSize = [ RenderTarget.GetWidth(), RenderTarget.GetHeight() ];
	let RandomSeed = 0;
	let Shader = Pop.GetShader( RenderTarget, PathTraceShader );
	let Time = (Pop.GetTimeNowMs() % 1000) / 1000;
	
	let RenderSpheres = GetRenderSpheres();
	RenderSpheres = UnrollArray16s(RenderSpheres,16*MAX_SPHERES)
	
	let SetUniforms = function(Shader)
	{
		Shader.SetUniform('camera_origin', Camera.Position );
		Shader.SetUniform('camera_lower_left_corner', Camera.LowerLeftCorner );
		Shader.SetUniform('camera_horizontal', Camera.Horizontal );
		Shader.SetUniform('camera_vertical', Camera.Vertical );
		Shader.SetUniform('camera_lens_radius', Camera.LensRadius );
		Shader.SetUniform('window_size', WindowSize );
		Shader.SetUniform('random_seed', RandomSeed );
		Shader.SetUniform('Time', Time);
		Shader.SetUniform('Spheres',RenderSpheres);
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

/*
function GetCubePositionsFromLeapFrame(Frame)
{
	let Positions = [];
	
	let EnumHand = function(Hand)
	{
		if ( !Hand )
			return;
		
		let EnumJoint = function(JointName)
		{
			//	skip over non-positions
			const xyz = Hand[JointName];
			if ( !Array.isArray(xyz) && xyz.constructor != Float32Array )
				return;
			
			let JointFilter =
			[
			 'Thumb0','Middle0','Ring0','Pinky0','Index0',
			 'Thumb1','Middle1','Ring1','Pinky1','Index1',
			 'Thumb2','Middle2','Ring2','Pinky2','Index2',
			 'Thumb3','Middle3','Ring3','Pinky3','Index3',
			 ];
			if ( !JointFilter.includes(JointName) )
				return;
			
			//Pop.Debug(JointName);
			//	gr: engine doesnt take Float32Array??
			Positions.push( Array.from(xyz) );
		}
		let Joints = Object.keys(Hand);
		Joints.forEach( EnumJoint );
	}
	EnumHand( Frame.Left );
	EnumHand( Frame.Right );
	//Pop.Debug("Got positions x",Positions.length,Positions[0]);
	return Positions;
}

function OnLeapFrame(Frame)
{
	let Positions = GetCubePositionsFromLeapFrame(Frame);
	if ( Positions.length == 0 )
	{
		Pop.Debug("no positions");
		return;
	}

	let Radiuses = [ 0.01, 0.02, 0.02, 0.04 ];
	
	RenderSpheres = [];
	let PushSphere = function(xyz)
	{
		let Radius = 0.01;
		xyz[1] -= 0.1;
		xyz.push(Radius);
		
		let Colour = [1,1,1];
		xyz = xyz.concat( Colour );
		
		RenderSpheres.push( xyz );
	}
	Positions.forEach( PushSphere );
}




async function LeapMotionLoop()
{
	let Leap = null;
	let FrameCounter = new Pop.FrameCounter("Leap Motion");
	while ( true )
	{
		try
		{
			if ( !Leap )
			{
				//	gr: todo: turn this into an "xr" device
				//			new Pop.Xr.Input("LeapMotion")
				Leap = new Pop.LeapMotion.Input();
			}
			
			const NextFrame = await Leap.GetNextFrame();
			OnLeapFrame(NextFrame);
			FrameCounter.Add();
			//Pop.Debug("New leap motion frame",JSON.stringify(NextFrame) );
		}
		catch(e)
		{
			Pop.Debug("Leap error",e);
			Leap = null;
			await Pop.Yield(100);
		}
	}
}
LeapMotionLoop().then(Pop.Debug).catch(Pop.Debug);
*/

