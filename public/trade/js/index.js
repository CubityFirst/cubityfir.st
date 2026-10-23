//I'm so sorry any of this has to be done the way it was.
function animateCss(el, animationName, callback) {
    el.classList.add('animated', animationName);
    el.addEventListener('animationend', function () {
        el.classList.remove('animated', animationName);
        if (typeof callback === 'function') callback();
    }, { once: true });
}

function changeColor(color) {
    document.getElementById("hideMe").style.color = '#fff';
}

function hide() {
    document.querySelector('.infoDiv').textContent = '󠀡';
    document.getElementById("hideMe").style.color = '#242424';
}

function showText(LocalText) {
    var infoDiv = document.querySelector('.infoDiv');
    animateCss(infoDiv, 'tada');
    infoDiv.textContent = LocalText;
    changeColor();
}