import React, { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Typography from '@material-ui/core/Typography';
import Avatar from '@material-ui/core/Avatar';
import Chip from '@material-ui/core/Chip';
import IconButton from '@material-ui/core/IconButton';
import Tooltip from '@material-ui/core/Tooltip';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import ClearOutlinedIcon from '@material-ui/icons/ClearOutlined';
import DoneIcon from '@material-ui/icons/Done';
import VisibilityIcon from '@material-ui/icons/Visibility';
import { useHistory } from 'react-router-dom';
import api from '../../services/api';
import toastError from '../../errors/toastError';
import TicketMessagesDialog from '../../components/TicketMessagesDialog';

const useStyles = makeStyles((theme) => ({
  card: {
    marginBottom: theme.spacing(1),
    cursor: 'inherit', // handled by draggable
    '&:hover': {
      boxShadow: theme.shadows[3],
    }
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
  avatar: {
    marginRight: theme.spacing(1),
    width: 32,
    height: 32,
  },
  tagsContainer: {
    marginTop: theme.spacing(1),
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
  },
  contactName: {
    fontWeight: 'bold',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing(0.5)
  },
  quickActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 2
  }
}));

const TicketCard = ({ ticket, type = 'ticket', onRefresh, user }) => {
  const classes = useStyles();
  const history = useHistory();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleCloseTicket = async () => {
    try {
      await api.put(`/tickets/${ticket.id}`, {
        status: 'closed',
        justClose: true,
        userId: user?.id
      });
      setActionsOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      toastError(err);
    }
  };

  const handleAcceptTicket = async () => {
    try {
      await api.put(`/tickets/${ticket.id}`, {
        status: 'open',
        userId: user?.id
      });
      setActionsOpen(false);
      history.push(`/tickets/${ticket.uuid}`);
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <Card className={classes.card} variant="outlined">
      <CardContent style={{ padding: 12 }}>
        <div className={classes.header}>
          <Avatar src={ticket.contact?.profilePicUrl} className={classes.avatar} />
          <div>
            <Typography variant="body2" className={classes.contactName}>
              {ticket.contact?.name || ticket.name}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {ticket.contact?.number || ticket.number || ''}
            </Typography>
          </div>
        </div>

        {type === 'ticket' && ticket.whatsapp && (
          <Typography variant="caption" display="block" color="textSecondary">
            Conexão: {ticket.whatsapp.name}
          </Typography>
        )}

        {type === 'ticket' && ticket.user && (
          <Typography variant="caption" display="block" color="textSecondary">
            Atendente: {ticket.user.name}
          </Typography>
        )}

        <div className={classes.tagsContainer}>
          {ticket.tags && ticket.tags.map(tag => (
            <Chip
              key={tag.id}
              label={tag.name}
              size="small"
              style={{ backgroundColor: tag.color, color: '#fff', fontSize: '0.65rem', height: 20 }}
            />
          ))}
        </div>

        {type === 'ticket' && (
          <div className={classes.actions}>
            <Typography variant="caption" color="textSecondary">
              {ticket.queue?.name || 'Sem fila'}
            </Typography>
            <div className={classes.quickActions}>
              <Tooltip title="Ações">
                <IconButton size="small" onClick={() => setActionsOpen(prev => !prev)}>
                  <MoreHorizIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              {actionsOpen && (
                <>
                  <Tooltip title="Fechar Conversa">
                    <IconButton size="small" onClick={handleCloseTicket}>
                      <ClearOutlinedIcon fontSize="small" style={{ color: '#c62828' }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Espiar Conversa">
                    <IconButton size="small" onClick={() => setPreviewOpen(true)}>
                      <VisibilityIcon fontSize="small" style={{ color: '#1565c0' }} />
                    </IconButton>
                  </Tooltip>
                  {ticket.status === 'pending' && (
                    <Tooltip title="Aceitar Conversa">
                      <IconButton size="small" onClick={handleAcceptTicket}>
                        <DoneIcon fontSize="small" style={{ color: '#2e7d32' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {type === 'ticket' && (
          <TicketMessagesDialog
            open={previewOpen}
            handleClose={() => setPreviewOpen(false)}
            ticketId={ticket.id}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default TicketCard;
