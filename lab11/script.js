// Select all walnut images
const walnuts = document.querySelectorAll("img");

// Randomly select one walnut to hide the peanut
const winningIndex = Math.floor(Math.random() * walnuts.length);

// Add click event to each walnut
walnuts.forEach((walnut, index) => {
    walnut.addEventListener("click", () => {
        if (index === winningIndex) {
            walnut.src = "https://peopel-su.github.io/ist263/images/peanut.png";
        } else {
            walnut.classList.add("animate__animated", "animate__shakeX");
        }
    });
});
