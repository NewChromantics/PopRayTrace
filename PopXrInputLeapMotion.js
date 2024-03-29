if ( !Pop.Xr )
	Pop.Xr = {};


let TLeapMotionContext = function()
{
	this.OnFrameCallbacks = [];
	this.Leap = null;
	
	this.AddListener = function(OnFrameCallback)
	{
		this.OnFrameCallbacks.push( OnFrameCallback );
	}
	
	this.OnLeapFrame = function(Frame)
	{
		this.OnFrameCallbacks.forEach( Callback => Callback(Frame) );
	}
	
	this.Loop = async function()
	{
		let FrameCounter = new Pop.FrameCounter("Leap Motion");
		while ( true )
		{
			try
			{
				if ( !this.Leap )
				{
					//	gr: todo: turn this into an "xr" device
					//			new Pop.Xr.Input("LeapMotion")
					this.Leap = new Pop.LeapMotion.Input();
				}
				
				const NextFrame = await this.Leap.GetNextFrame();
				this.OnLeapFrame(NextFrame);
				FrameCounter.Add();
				//Pop.Debug("New leap motion frame",JSON.stringify(NextFrame) );
			}
			catch(e)
			{
				Pop.Debug("Leap error",e);
				this.Leap = null;
				await Pop.Yield(999100);
			}
		}
	}
	
	this.OnError = function(Error)
	{
		Pop.Debug("Leap Error: " + Error );
	}
	
	this.Loop().then(Pop.Debug).catch( this.OnError.bind(this) );
}

let LeapMotionContext = null;

function TXrInputState()
{
	this.Tracking = false;		//	state of device
	
	this.ButtonState = [];
	
	//	this should change to be a bunch of actors, or renderers or something
	this.ButtonPositions = [];
}

Pop.Xr.InputLeapMotion = function(DeviceName)
{
	if ( !LeapMotionContext )
		LeapMotionContext = new TLeapMotionContext();

	this.LastState = null;	//	TXrInputState
	this.FingerClickDistance = 0.03;
	
	this.OnFrame = function(Frame)
	{
		if ( !Frame.hasOwnProperty(DeviceName) )
		{
			this.LastState = null;
			return;
		}
		
		let Hand = Frame[DeviceName];
		
		//	extract positions
		let State = new TXrInputState();
		State.Tracking = true;
		
		let FingerClickDistance = this.FingerClickDistance;
		let IsButtonPressed = function(ThumbJoint,FingerJoint)
		{
			let Thumb3 = Hand[ThumbJoint];
			let Finger3 = Hand[FingerJoint];
			if ( !Thumb3 || !Finger3 )
				return false;
			
			let Distance = Math.Distance3( Thumb3, Finger3 );
			//Pop.Debug("Distance:",Distance, FingerClickDistance);
			if ( Distance > FingerClickDistance )
				return false;
			return true;
		}
		
		let AddButton = function(JointName,ButtonIndex,Pressed)
		{
			Pressed = Pressed === true;
			if ( ButtonIndex !== undefined )
				State.ButtonState[ButtonIndex] = Pressed;
			
			let Joint = Hand[JointName];
			if ( Joint === undefined )
			{
				State.ButtonPositions.push( null );
				//Pop.Debug( JSON.stringify(Hand) );
				return;
			}
			//Pop.Debug( JointName, JSON.stringify(Joint) );
			
			//	lower y
			Joint[1] -= 0.1;
			State.ButtonPositions.push( Array.from(Joint) );
		}
		AddButton('Index3', 0, IsButtonPressed('Thumb3','Index3') );
		AddButton('Middle3', 1, IsButtonPressed('Thumb3','Middle3')) ;
		AddButton('Ring3', 2, IsButtonPressed('Thumb3','Ring3') );
		AddButton('Pinky3', 3, IsButtonPressed('Thumb3','Pinky3') );
		AddButton('Thumb3');

		//	calc button press (pinch of fingers)
		this.LastState = State;
	}
	
	this.GetNullState = function()
	{
		//	the null state should have all the known-buttons present, but off
		return new TXrInputState();
	}
	
	this.GetControllerState = function()
	{
		if ( !this.LastState )
			return this.GetNullState();
		
		return this.LastState;
	}
	
	LeapMotionContext.AddListener( this.OnFrame.bind(this) );
}
