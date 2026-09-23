function openAddPropertyModal(){
  var modal = document.getElementById("addPropertyModal");
  if(modal){
    modal.classList.remove("hidden");
    setTimeout(function(){
      var input = document.getElementById("newPropertyName");
      if(input){ input.focus(); }
    }, 80);
  }
}

function closeAddPropertyModal(){
  var modal = document.getElementById("addPropertyModal");
  if(modal){
    modal.classList.add("hidden");
  }
}

document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){
    closeAddPropertyModal();
  }
});
