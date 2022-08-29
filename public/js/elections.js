var states;
var selectedStateId = '<%=state%>' || "2"
var selectedYear = '<%=year%>' || "2014"
d3.json("/json/states_data.json", function(error, result){
    states = result
    var state = d3.select('#state')
    state.selectAll('option').remove()
    state.selectAll('option').data(result)
        .enter()
        .append('option')
        .attr('value', function(d){return d.id})
        .text(function(d){return d.state_name}) 

    $('#state option[value="'+ selectedStateId  + '"]').prop('selected', true)
    var year = d3.select('#year')
    year.selectAll('option').remove()
    year.selectAll('option').data(function(){ 
        for(var i = 0; i<result.length; i++ ){
            if(Number(selectedStateId == states[i].id)){
                return Object.keys(states[i].election_years)
            }
        } 
    }).enter().append('option').attr('value', function(d){return d}).text(function(d){return d})
    $('#year option[value="'+ selectedYear  + '"]').prop('selected', true)
})