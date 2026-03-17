import React, { useState, useEffect, useContext } from "react";
import { makeStyles } from "@material-ui/core/styles";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import SettingsIcon from "@material-ui/icons/Settings";
import toastError from "../../errors/toastError";
import TicketCard from "./TicketCard";
import { useHistory, useLocation } from "react-router-dom";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    width: "100%",
    height: "calc(100vh - 120px)",
    overflowX: "auto",
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default
  },
  column: {
    minWidth: 300,
    maxWidth: 300,
    marginRight: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    maxHeight: "100%",
    boxShadow: theme.shadows[2],
  },
  columnHeader: {
    padding: theme.spacing(2),
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    fontWeight: "bold",
    textAlign: "center"
  },
  ticketList: {
    padding: theme.spacing(1),
    flexGrow: 1,
    overflowY: "auto",
    minHeight: 100
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 20px",
    borderBottom: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
  }
}));

const Kanban = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);

  const [funnels, setFunnels] = useState([]);
  const [activeFunnelIndex, setActiveFunnelIndex] = useState(0);
  const [activeFunnelType, setActiveFunnelType] = useState("ticket");
  const [tickets, setTickets] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [columns, setColumns] = useState([]);
  const filteredFunnels = funnels.filter(f => {
    if (!f.type) return activeFunnelType === "ticket";
    return f.type === activeFunnelType;
  });
  const activeFunnel = filteredFunnels[activeFunnelIndex] || null;
  const history = useHistory();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedType = params.get("type");
    const requestedFunnelId = params.get("funnelId");

    if (["ticket", "contact"].includes(requestedType)) {
      setActiveFunnelType(requestedType);
    }

    if (requestedFunnelId && filteredFunnels.length > 0) {
      const idx = filteredFunnels.findIndex(f => String(f.id) === String(requestedFunnelId));
      if (idx >= 0) {
        setActiveFunnelIndex(idx);
      }
    }
  }, [location.search, filteredFunnels]);

  useEffect(() => {
    fetchFunnels();
  }, []);

  useEffect(() => {
    if (activeFunnel) {
      if (activeFunnelType === "ticket") {
        fetchTickets();
      } else {
        fetchContacts();
      }
    } else {
      setTickets([]);
      setContacts([]);
      setColumns([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFunnel?.id, activeFunnelType]);

  useEffect(() => {
    if (activeFunnel && activeFunnelType === "ticket" && tickets) {
      const cols = activeFunnel.stages?.map(stage => {
        return {
          ...stage,
          tickets: tickets.filter(t =>
            t.tags?.some(tag => tag.id === stage.id)
          )
        };
      }) || [];
      setColumns(cols);
    }
  }, [activeFunnel, tickets, activeFunnelType]);

  useEffect(() => {
    if (activeFunnel && activeFunnelType === "contact" && contacts) {
      const cols = activeFunnel.stages?.map(stage => {
        return {
          ...stage,
          tickets: contacts.filter(c =>
            c.tags?.some(tag => tag.id === stage.id)
          )
        };
      }) || [];
      setColumns(cols);
    }
  }, [activeFunnel, contacts, activeFunnelType]);

  const fetchFunnels = async () => {
    try {
      const { data } = await api.get("/funnels");
      setFunnels(data);
    } catch (err) {
      toastError(err);
    }
  };

  const fetchTickets = async () => {
    if (!activeFunnel) return;
    try {
      const { data } = await api.get("/kanban", {
        params: { funnelId: activeFunnel.id }
      });
      setTickets(data.tickets || []);
    } catch (err) {
      toastError(err);
    }
  };

  const fetchContacts = async () => {
    if (!activeFunnel) return;
    try {
      const { data } = await api.get("/contacts", {
        params: { searchParam: "", pageNumber: 1 }
      });
      setContacts(data.contacts || []);
    } catch (err) {
      toastError(err);
    }
  };

  const onDragEnd = async result => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const itemId = draggableId;
    const newStageId = destination.droppableId;

    // Optimistic UI Update
    const updatedColumns = [...columns];
    const sourceColIndex = updatedColumns.findIndex(c => c.id.toString() === source.droppableId);
    const destColIndex = updatedColumns.findIndex(c => c.id.toString() === destination.droppableId);

    const ticketObj = updatedColumns[sourceColIndex].tickets[source.index];
    updatedColumns[sourceColIndex].tickets.splice(source.index, 1);
    updatedColumns[destColIndex].tickets.splice(destination.index, 0, ticketObj);
    setColumns(updatedColumns);

    try {
      if (activeFunnelType === "ticket") {
        await api.put(`/tickets/${itemId}`, {
          stageId: Number(newStageId),
          funnelId: activeFunnel.id
        });
        setTimeout(fetchTickets, 800);
      } else {
        await api.post(`/contacts/${itemId}/tags`, {
          tagId: Number(newStageId)
        });
        setTimeout(fetchContacts, 500);
      }
    } catch (err) {
      toastError(err);
      if (activeFunnelType === "ticket") {
        fetchTickets();
      } else {
        fetchContacts();
      }
    }
  };

  return (
    <>
      <div className={classes.topBar}>
        <Typography variant="h5" style={{ fontWeight: 700 }}>
          🗂 Kanban
        </Typography>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => history.push("/funnels")}
          startIcon={<SettingsIcon />}
        >
          Configurar Funis
        </Button>
      </div>

      <Tabs
        value={activeFunnelType}
        onChange={(_, value) => {
          setActiveFunnelType(value);
          setActiveFunnelIndex(0);
        }}
        indicatorColor="primary"
        textColor="primary"
        style={{ backgroundColor: "inherit", paddingLeft: 16 }}
      >
        <Tab value="ticket" label="Funis de Ticket" />
        <Tab value="contact" label="Funis de Contato" />
      </Tabs>

      {filteredFunnels.length > 1 && (
        <Tabs
          value={activeFunnelIndex}
          onChange={(_, v) => setActiveFunnelIndex(v)}
          indicatorColor="primary"
          textColor="primary"
          style={{ backgroundColor: "inherit", paddingLeft: 16 }}
        >
          {filteredFunnels.map(f => (
            <Tab key={f.id} label={f.name} />
          ))}
        </Tabs>
      )}

      <div className={classes.root}>
        {activeFunnel ? (
          <DragDropContext onDragEnd={onDragEnd}>
            {columns.map(column => (
              <Paper key={column.id} className={classes.column} elevation={3}>
                <Typography className={classes.columnHeader} variant="h6">
                  {column.name}
                  <br />
                  <span style={{ fontSize: "0.75rem", fontWeight: 400, opacity: 0.85 }}>
                    {column.tickets.length} ticket{column.tickets.length !== 1 ? "s" : ""}
                  </span>
                </Typography>
                <Droppable droppableId={column.id.toString()}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={classes.ticketList}
                      style={{
                        backgroundColor: snapshot.isDraggingOver
                          ? "rgba(0,0,0,0.05)"
                          : "transparent"
                      }}
                    >
                      {column.tickets.map((ticket, index) => (
                        <Draggable
                          key={ticket.id.toString()}
                          draggableId={ticket.id.toString()}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <TicketCard
                                ticket={ticket}
                                type={activeFunnelType}
                                onRefresh={() => {
                                  if (activeFunnelType === "ticket") {
                                    fetchTickets();
                                  } else {
                                    fetchContacts();
                                  }
                                }}
                                user={user}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </Paper>
            ))}
          </DragDropContext>
        ) : (
          <div style={{ margin: "auto", textAlign: "center" }}>
            <Typography variant="h5" color="textSecondary" gutterBottom>
              Nenhum funil de {activeFunnelType === "ticket" ? "Ticket" : "Contato"} configurado.
            </Typography>
            <Typography variant="body1" color="textSecondary">
              Clique em <b>Configurar Funis</b> e crie um funil do tipo <b>{activeFunnelType === "ticket" ? "Ticket" : "Contato"}</b>.
            </Typography>
          </div>
        )}
      </div>
    </>
  );
};

export default Kanban;
