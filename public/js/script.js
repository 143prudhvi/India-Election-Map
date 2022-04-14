var states;
var selectedState;
var selectedStateId = '<%=state%>'
var selectedYear = '<%=year%>'
d3.json("/json/states_data.json", function(error, result){
    states = result
    for(var i = 0; i<states.length; i++ ){
        if(Number(selectedStateId == states[i].id)){
            console.log(states[i])
            break
        }
    } 
    var state = d3.select('#state')
    state.selectAll('option').data(result)
        .enter()
        .append('option')
        .attr('value', function(d){return d.id})
        .text(function(d){return d.state_name})
})


$('#state').change((event) => {
    var year = d3.select('#year')
    year.selectAll('option').remove()
    year.selectAll('option').data(function(){ 
        for(var i = 0; i<states.length; i++ ){
            if(Number(event.target.value == states[i].id)){
                return states[i].election_years
            }
        } 
    }).enter().append('option').attr('value', function(d){return d}).text(function(d){return d})
})

$('.fetch').click(() => {
    var state = $('#state').val()
    var year = $('#year').val()
    var url = '?state=' + state + '&year=' + year
    window.location.href = url
})

var width = window.innerWidth * 0.67 ;
var height = window.innerHeight * 0.96;
var electionData = []

var data = [
    {
        party : "AAP",
        seats : 92
    },
    {
        party : "INC",
        seats : 18
    },
    {
        party : "SAD+",
        seats : 4
    },
    {
        party : "BJP",
        seats : 2
    },
    {
        party : "IND",
        seats : 1
    }
]
var radius = window.innerHeight * 0.23

var pie_color = ['#0066A4', "#34d5eb", "#ebc634", "#F97D09", "#bdbdbd"]
var pie = d3.layout.pie().startAngle(-90 * (Math.PI / 180)).endAngle(90 * (Math.PI / 180)).padAngle(.01)
var arc = d3.svg.arc().innerRadius(radius - radius * 0.4).outerRadius(radius)
var pie_svg = d3.select('.pie').append('svg')
                .attr('width' , window.innerWidth* 0.29 )
                .attr('height' , window.innerHeight * 0.23)

var pie_g = pie_svg.append('g')

pie_g.attr("transform" , 'translate(' + (window.innerWidth * 0.29)/ 2  + ',' + window.innerHeight * 0.23 + ')')
    .attr("stroke", 'black')
    .attr("stroke-width", 1)
    .attr("stroke-linejoin", 'round')
    .selectAll("arc")
    .data(pie(data.map(i => {return i.seats})))
    .enter().append('g')
    .append("path")
    .attr('fill' , function(d,i){return pie_color[i]})
    .attr('d' , arc)

pie_g.append('text')
    .attr('x' , '-25')
    .attr('y', '-20')
    .text('117')
    .attr('class', 'totalseats')

    

d3.json("/json/" + selectedState.state_name + "/" + selectedState.state_name + "-" + selectedYear + ".json", function(error, result){
    electionData = result
})

var projection = d3.geo.mercator().center([75.4,31]).scale(10000).translate([width/2 , height/1.75]);
var svg = d3.select(".map").append("svg")
    .attr("width", width)
    .attr("height", height);
var path = d3.geo.path()
    .projection(projection);
var g = svg.append("g");
g.append('text')
    .attr("x", width/3 )
    .attr("y", height /12)
    .text(selectedYear + " " + selectedState.state_name+ " Election Result");
d3.json("/json/" + selectedState.state_name + "/" + selectedState.state_name + ".json", function(error, topology) {
    g.selectAll("path")
        .data(topojson.object(topology, topology.objects[selectedState.state_name])
            .geometries)
    .enter()
        .append("path")
        .attr("d", path)
        .attr("stroke","black")
        .attr("stroke-width" , '0.7px')
        .style("fill", function(d) { return color(d.properties.Winner || d.properties['Winner Party']);} )
        .on('mouseover', handleMouseOver)
        .on('mouseout', handleMouseOut)
        .on('click', handleClick)
});

function color(party){
    if(party === "AAP"){
        return "#0066A4";
    }else if(party === "INC"){
        return "#34d5eb";
    }else if(party === "BJP"){
        return "#F97D09";
    }else if(party === "SAD"){
        return "#ebc634";
    }else if(party === "BSP"){
        return "#22409A";
    }else{
        return "#bdbdbd";
    }
}

function handleMouseOver(d, i) {  
}

function handleMouseOut(d, i) {
}
function handleClick(d, i) {
    for(var i = 0 ; i<= electionData.length ; i++){
        if(electionData[i].ac_no == Number(d.properties.ac_no)){
        d3.select('.ac_name').text(electionData[i].ac_no + "-" +electionData[i].ac_name)
        var partyDiv = d3.select(".parties");
        partyDiv.style('display', 'none')
        var candidatesDiv = d3.select(".candidates");
        candidatesDiv.style('display' , 'grid')
        var candidateDiv = candidatesDiv.selectAll(".candidate")
        candidateDiv.remove()
        candidateDiv = candidatesDiv.selectAll(".candidate")
        candidateDiv.data(top3(electionData[i].candidates)).enter().append("div").attr('class' , function(d,i){ return "candidate " +  d.Party.replaceAll(' ','_') })
                    .html(function(d){ return '<div class="candidateParty">' + d.Party + '</div><div class="candidateName">' + d.Candidate + '</div><div class="candidateDetails"><div class="votes"><div class="caption">Votes</div><div class="number">' + d['Total Votes'] + '</div></div><div class="votepercent"><div class="caption">Vote %</div><div class="number">' + d['Vote %'] + '</div></div></div>'})
        candidateDiv.attr('class' , function(d,i){ return "candidate " + d.Party.replaceAll(' ','_') } )
        

        break
        }
    }
    }

function top3(candidates){
    candidates.sort((a,b) => {return b['Total Votes'] - a['Total Votes']})
    return candidates
}