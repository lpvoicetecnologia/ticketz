import React, { useMemo, useState, useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import IconButton from "@material-ui/core/IconButton";
import DeleteIcon from "@material-ui/icons/Delete";
import AddIcon from "@material-ui/icons/Add";
import EditIcon from "@material-ui/icons/Edit";
import SaveIcon from "@material-ui/icons/Save";
import CloseIcon from "@material-ui/icons/Close";
import SettingsIcon from "@material-ui/icons/Settings";
import ArrowUpwardIcon from "@material-ui/icons/ArrowUpward";
import ArrowDownwardIcon from "@material-ui/icons/ArrowDownward";
import ViewListIcon from "@material-ui/icons/ViewList";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import Select from "@material-ui/core/Select";
import MenuItem from "@material-ui/core/MenuItem";
import Chip from "@material-ui/core/Chip";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";

const useStyles = makeStyles(theme => ({
    mainPaper: {
        flex: 1,
        padding: theme.spacing(2),
        overflowY: "scroll",
        ...theme.scrollbarStyles
    },
    tableHeader: {
        display: "grid",
        gridTemplateColumns: "80px 1fr 130px 100px 180px",
        gap: 8,
        borderBottom: `1px solid ${theme.palette.divider}`,
        paddingBottom: 8,
        marginBottom: 8,
        fontWeight: 700,
        color: theme.palette.text.secondary
    },
    tableRow: {
        display: "grid",
        gridTemplateColumns: "80px 1fr 130px 100px 180px",
        gap: 8,
        alignItems: "center",
        borderBottom: `1px solid ${theme.palette.divider}`,
        padding: "10px 0"
    },
    stageRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        borderBottom: `1px solid ${theme.palette.divider}`,
        padding: "8px 0"
    },
    stageActions: {
        display: "flex",
        alignItems: "center",
        gap: 2
    },
    commandsBox: {
        marginTop: 8,
        marginBottom: 8,
        padding: 8,
        borderRadius: 4,
        border: `1px solid ${theme.palette.divider}`,
        background: theme.palette.background.default
    },
    editCommandsBox: {
        background: "#1e1e1e",
        color: "#d4d4d4",
        fontFamily: "monospace",
        borderRadius: 4,
        fontSize: "0.8rem"
    }
}));

const isJsonArray = value => {
    try {
        const parsed = JSON.parse(value || "[]");
        return Array.isArray(parsed) || (parsed && typeof parsed === "object");
    } catch {
        return false;
    }
};

const parseCommandsArray = value => {
    try {
        const parsed = JSON.parse(value || "[]");
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object") return [parsed];
        return [];
    } catch {
        return [];
    }
};

const commandsToEditorString = value => {
    if (typeof value === "string") {
        return JSON.stringify(parseCommandsArray(value), null, 2);
    }

    if (Array.isArray(value)) {
        return JSON.stringify(value, null, 2);
    }

    if (value && typeof value === "object") {
        return JSON.stringify([value], null, 2);
    }

    return "[]";
};

const formatTagWithFunnel = tag => {
    if (tag?.funnel?.name) return `${tag.funnel.name} • ${tag.name}`;
    return tag?.name || "";
};

const Funnels = () => {
    const classes = useStyles();

    const [funnels, setFunnels] = useState([]);
    const [allTags, setAllTags] = useState([]);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingFunnel, setEditingFunnel] = useState(null);

    const [funnelForm, setFunnelForm] = useState({
        name: "",
        type: "contact",
        color: "#A4A4A4"
    });

    const [selectedTagId, setSelectedTagId] = useState("");
    const [newTagName, setNewTagName] = useState("");

    const [openCommandsByStage, setOpenCommandsByStage] = useState({});
    const [commandsDraftByStage, setCommandsDraftByStage] = useState({});

    useEffect(() => {
        loadAll();
    }, []);

    const loadAll = async () => {
        await Promise.all([loadFunnels(), loadTags()]);
    };

    const loadFunnels = async () => {
        try {
            const { data } = await api.get("/funnels");
            setFunnels(data || []);
        } catch (err) {
            toastError(err);
        }
    };

    const loadTags = async () => {
        try {
            const { data } = await api.get("/tags/list");
            setAllTags(data || []);
        } catch (err) {
            toastError(err);
        }
    };

    const refreshEditingFunnel = async funnelId => {
        const { data } = await api.get("/funnels");
        setFunnels(data || []);
        const found = (data || []).find(f => Number(f.id) === Number(funnelId));
        if (found) {
            setEditingFunnel(found);
        }
    };

    const handleOpenCreate = () => {
        setEditingFunnel(null);
        setFunnelForm({ name: "", type: "contact", color: "#A4A4A4" });
        setSelectedTagId("");
        setNewTagName("");
        setOpenCommandsByStage({});
        setCommandsDraftByStage({});
        setModalOpen(true);
    };

    const handleOpenEdit = funnel => {
        setEditingFunnel(funnel);
        setFunnelForm({
            name: funnel.name || "",
            type: funnel.type || "contact",
            color: funnel.color || "#A4A4A4"
        });
        setSelectedTagId("");
        setNewTagName("");
        setOpenCommandsByStage({});
        setCommandsDraftByStage({});
        setModalOpen(true);
    };

    const handleSaveFunnel = async () => {
        if (!funnelForm.name?.trim()) {
            toast.error("Informe o nome do funil");
            return;
        }

        try {
            if (editingFunnel?.id) {
                await api.put(`/funnels/${editingFunnel.id}`, funnelForm);
                toast.success("Funil atualizado com sucesso!");
                await refreshEditingFunnel(editingFunnel.id);
            } else {
                const { data } = await api.post("/funnels", funnelForm);
                toast.success("Funil criado com sucesso!");
                await loadAll();
                setEditingFunnel(data);
            }
        } catch (err) {
            toastError(err);
        }
    };

    const handleDeleteFunnel = async id => {
        if (!window.confirm("Deseja realmente deletar este funil e suas etapas?")) return;
        try {
            await api.delete(`/funnels/${id}`);
            toast.success("Funil deletado com sucesso!");
            await loadAll();
            if (editingFunnel?.id === id) {
                setModalOpen(false);
            }
        } catch (err) {
            toastError(err);
        }
    };

    const availableTags = useMemo(() => {
        if (!editingFunnel?.id) return [];
        const currentIds = new Set((editingFunnel.stages || []).map(s => s.id));
        return (allTags || []).filter(tag => {
            if (currentIds.has(tag.id)) return false;
            return !tag.funnelId || Number(tag.funnelId) === Number(editingFunnel.id);
        });
    }, [allTags, editingFunnel]);

    const handleAddExistingTag = async () => {
        if (!editingFunnel?.id || !selectedTagId) return;

        try {
            await api.post(`/funnels/${editingFunnel.id}/stages`, {
                tagId: Number(selectedTagId),
                order: (editingFunnel.stages?.length || 0) + 1
            });
            toast.success("Tag associada ao funil!");
            setSelectedTagId("");
            await loadTags();
            await refreshEditingFunnel(editingFunnel.id);
        } catch (err) {
            toastError(err);
        }
    };

    const handleCreateNewTag = async () => {
        if (!editingFunnel?.id || !newTagName.trim()) return;

        try {
            await api.post(`/funnels/${editingFunnel.id}/stages`, {
                name: newTagName.trim(),
                order: (editingFunnel.stages?.length || 0) + 1
            });
            toast.success("Tag criada e vinculada ao funil!");
            setNewTagName("");
            await loadTags();
            await refreshEditingFunnel(editingFunnel.id);
        } catch (err) {
            toastError(err);
        }
    };

    const handleDeleteStage = async stageId => {
        if (!window.confirm("Deseja remover esta tag do funil?")) return;
        try {
            await api.delete(`/stages/${stageId}`);
            toast.success("Tag removida do funil!");
            await loadTags();
            await refreshEditingFunnel(editingFunnel.id);
        } catch (err) {
            toastError(err);
        }
    };

    const handleMoveStage = async (stage, direction) => {
        const ordered = [...(editingFunnel.stages || [])].sort((a, b) => (a.kanban || 0) - (b.kanban || 0));
        const idx = ordered.findIndex(s => s.id === stage.id);
        if (idx < 0) return;

        const targetIdx = direction === "up" ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= ordered.length) return;

        const target = ordered[targetIdx];

        try {
            await Promise.all([
                api.put(`/stages/${stage.id}`, {
                    name: stage.name,
                    order: target.kanban,
                    commands: parseCommandsArray(stage.commands)
                }),
                api.put(`/stages/${target.id}`, {
                    name: target.name,
                    order: stage.kanban,
                    commands: parseCommandsArray(target.commands)
                })
            ]);
            await refreshEditingFunnel(editingFunnel.id);
        } catch (err) {
            toastError(err);
        }
    };

    const toggleCommandsEditor = stage => {
        setOpenCommandsByStage(prev => ({ ...prev, [stage.id]: !prev[stage.id] }));
        if (commandsDraftByStage[stage.id] === undefined) {
            setCommandsDraftByStage(prev => ({
                ...prev,
                [stage.id]: commandsToEditorString(stage.commands)
            }));
        }
    };

    const handleSaveCommands = async stage => {
        const raw = commandsDraftByStage[stage.id] || "[]";
        if (!isJsonArray(raw)) {
            toast.error("Comandos inválidos. Use um array JSON.");
            return;
        }

        try {
            await api.put(`/stages/${stage.id}`, {
                name: stage.name,
                order: stage.kanban,
                commands: JSON.parse(raw)
            });
            toast.success("Comandos salvos!");
            await refreshEditingFunnel(editingFunnel.id);
            setOpenCommandsByStage(prev => ({ ...prev, [stage.id]: false }));
        } catch (err) {
            toastError(err);
        }
    };

    return (
        <MainContainer>
            <MainHeader>
                <Title>Funis</Title>
                <Button variant="contained" color="primary" onClick={handleOpenCreate}>
                    Adicionar Funil
                </Button>
            </MainHeader>

            <Paper className={classes.mainPaper} variant="outlined">
                <div className={classes.tableHeader}>
                    <div>ID</div>
                    <div>Nome</div>
                    <div>Type</div>
                    <div>Count</div>
                    <div>Ações</div>
                </div>

                {funnels.map(funnel => (
                    <div key={funnel.id} className={classes.tableRow}>
                        <div>{funnel.id}</div>
                        <div>{funnel.name}</div>
                        <div>{funnel.type}</div>
                        <div>{(funnel.stages || []).length}</div>
                        <div>
                            <IconButton size="small" title="Gerenciar" onClick={() => handleOpenEdit(funnel)}>
                                <ViewListIcon />
                            </IconButton>
                            <IconButton size="small" title="Editar" onClick={() => handleOpenEdit(funnel)}>
                                <EditIcon />
                            </IconButton>
                            <IconButton size="small" title="Excluir" onClick={() => handleDeleteFunnel(funnel.id)}>
                                <DeleteIcon />
                            </IconButton>
                        </div>
                    </div>
                ))}
            </Paper>

            <Dialog open={modalOpen} onClose={() => setModalOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>{editingFunnel ? "Editar Funil" : "Criar Funil"}</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="Nome do Funil"
                        value={funnelForm.name}
                        onChange={e => setFunnelForm(prev => ({ ...prev, name: e.target.value }))}
                        style={{ marginBottom: 16 }}
                    />

                    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                        <FormControl fullWidth>
                            <InputLabel>Tipo de Funil</InputLabel>
                            <Select
                                value={funnelForm.type}
                                onChange={e => setFunnelForm(prev => ({ ...prev, type: e.target.value }))}
                            >
                                <MenuItem value="contact">Contato</MenuItem>
                                <MenuItem value="ticket">Ticket</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField
                            style={{ width: 180 }}
                            type="color"
                            label="Cor do Funil"
                            value={funnelForm.color}
                            onChange={e => setFunnelForm(prev => ({ ...prev, color: e.target.value }))}
                        />
                    </div>

                    <Button variant="contained" color="primary" startIcon={<SaveIcon />} onClick={handleSaveFunnel}>
                        Salvar Funil
                    </Button>

                    {editingFunnel?.id && (
                        <>
                            <div style={{ marginTop: 20, marginBottom: 8, fontWeight: 600 }}>Tag</div>

                            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Selecionar Tag</InputLabel>
                                    <Select value={selectedTagId} onChange={e => setSelectedTagId(e.target.value)}>
                                        {availableTags.map(tag => (
                                            <MenuItem key={tag.id} value={tag.id}>
                                                {formatTagWithFunnel(tag)}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={handleAddExistingTag}>
                                    Adicionar
                                </Button>
                            </div>

                            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
                                <TextField
                                    fullWidth
                                    label="Criar nova Tag"
                                    value={newTagName}
                                    onChange={e => setNewTagName(e.target.value)}
                                />
                                <Button variant="outlined" color="primary" onClick={handleCreateNewTag}>
                                    Criar Tag
                                </Button>
                            </div>

                            {(editingFunnel.stages || [])
                                .slice()
                                .sort((a, b) => (a.kanban || 0) - (b.kanban || 0))
                                .map((stage, idx, arr) => {
                                    const draft =
                                        commandsDraftByStage[stage.id] !== undefined
                                            ? commandsDraftByStage[stage.id]
                                            : commandsToEditorString(stage.commands);
                                    const valid = isJsonArray(draft);

                                    return (
                                        <div key={stage.id}>
                                            <div className={classes.stageRow}>
                                                <Chip
                                                    label={`${editingFunnel.name} • ${stage.name}`}
                                                    style={{
                                                        backgroundColor: stage.color || editingFunnel.color || "#A4A4A4",
                                                        color: "#fff"
                                                    }}
                                                />

                                                <div className={classes.stageActions}>
                                                    <IconButton size="small" disabled={idx === 0} onClick={() => handleMoveStage(stage, "up")}>
                                                        <ArrowUpwardIcon />
                                                    </IconButton>
                                                    <IconButton size="small" disabled={idx === arr.length - 1} onClick={() => handleMoveStage(stage, "down")}>
                                                        <ArrowDownwardIcon />
                                                    </IconButton>

                                                    {editingFunnel.type === "ticket" && (
                                                        <IconButton size="small" onClick={() => toggleCommandsEditor(stage)}>
                                                            <SettingsIcon />
                                                        </IconButton>
                                                    )}

                                                    <IconButton size="small" onClick={() => handleDeleteStage(stage.id)}>
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </div>
                                            </div>

                                            {editingFunnel.type === "ticket" && openCommandsByStage[stage.id] && (
                                                <div className={classes.commandsBox}>
                                                    <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 6 }}>
                                                        {"Use array JSON. Ex: [{ \"action\": \"addContactTag\", \"tagId\": 124, \"advanceOnly\": true }]"}
                                                    </Typography>
                                                    <TextField
                                                        fullWidth
                                                        multiline
                                                        rows={4}
                                                        variant="outlined"
                                                        value={draft}
                                                        onChange={e =>
                                                            setCommandsDraftByStage(prev => ({
                                                                ...prev,
                                                                [stage.id]: e.target.value
                                                            }))
                                                        }
                                                        error={!valid}
                                                        helperText={!valid ? "JSON inválido: deve ser um array" : " "}
                                                        InputProps={{ className: classes.editCommandsBox }}
                                                    />
                                                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                                        <Button
                                                            size="small"
                                                            color="primary"
                                                            variant="contained"
                                                            startIcon={<SaveIcon />}
                                                            disabled={!valid}
                                                            onClick={() => handleSaveCommands(stage)}
                                                        >
                                                            Salvar
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setModalOpen(false)} startIcon={<CloseIcon />}>
                        Fechar
                    </Button>
                </DialogActions>
            </Dialog>
        </MainContainer>
    );
};

export default Funnels;
