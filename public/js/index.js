function switchVisible() {
            if (document.getElementById('box')) {
	                if (document.getElementById('box').style.display == 'none') {
                    document.getElementById('box').style.display = 'block';
                    document.getElementById('dirbox').style.display = 'none';
                }
                else {
                    document.getElementById('box').style.display = 'none';
                    document.getElementById('dirbox').style.display = 'block';
                }
            }
}

var allowedKeys = {37: 'l',38: 'u',39: 'r',40: 'd',65: 'a',66: 'b'};
var konamiCode = ['u', 'u', 'd', 'd', 'l', 'r', 'l', 'r', 'b', 'a'];
var konamiCodePosition = 0;

document.addEventListener('keydown', function(e) {
  var key = allowedKeys[e.keyCode];
  var requiredKey = konamiCode[konamiCodePosition];
  if (key == requiredKey) {
    konamiCodePosition++;
    if (konamiCodePosition == konamiCode.length) {
      activateCheats();
      konamiCodePosition = 0;
    }
  } else {
    konamiCodePosition = 0;
  }
});

function activateCheats() {
            document.getElementById('desc1').innerHTML = 'You';
            document.getElementById('desc2').innerHTML = 'Found';
            document.getElementById('desc3').innerHTML = 'The';
            document.getElementById('desc4').innerHTML = 'Secret';
            document.getElementById('desc5').innerHTML = 'Congratulations!';
	setTimeout(function(){
                window.location.replace("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
            }, 5000);
}


// Easter Eggs
function EasterEgg() {
    var EasterEggChance = Math.floor((Math.random() * 100) + 1);
    //console.log ("Easter Egg: " + EasterEggChance);
    if (EasterEggChance == 1) {
        var EasterEgg = Math.floor((Math.random() * 4) + 1);
        if (EasterEgg == 1) {
            console.log("Easter Egg 1 Activated.");
            document.getElementById('desc1').innerHTML = 'Never';
            document.getElementById('desc2').innerHTML = 'Gonna';
            document.getElementById('desc3').innerHTML = 'Give';
            document.getElementById('desc4').innerHTML = '<br>You';
            document.getElementById('desc5').innerHTML = 'Up';
            setTimeout(function(){
                window.location.replace("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
            }, 30000);
        }
        else if (EasterEgg == 2 ) {
            console.log("Easter Egg 2 Activated.");
            document.getElementById('desc1').innerHTML = 'K';
            document.getElementById('desc2').innerHTML = 'A';
            document.getElementById('desc3').innerHTML = 'P';
            document.getElementById('desc4').innerHTML = 'P';
            document.getElementById('desc5').innerHTML = 'A';
        }
        else if (EasterEgg == 3 ) {
            console.log("Easter Egg 3 Activated.");
            document.getElementById('desc1').innerHTML = "Don't";
            document.getElementById('desc2').innerHTML = 'Do';
            document.getElementById('desc3').innerHTML = 'Bad';
            document.getElementById('desc4').innerHTML = 'Things';
            document.getElementById('desc5').innerHTML = '<br>- Talon';
        }
        else if (EasterEgg == 4 ) {
            console.log("Easter Egg 3 Activated.");
            document.getElementById('desc1').innerHTML = "|\\---/|<br>" +
                "    | ,_, |<br>" +
                "\"Nyah~~\"- Wise, 2020<br>";
            document.getElementById('desc2').innerHTML = '';
            document.getElementById('desc3').innerHTML = '';
            document.getElementById('desc4').innerHTML = '';
            document.getElementById('desc5').innerHTML = '';
        }
    }
}

